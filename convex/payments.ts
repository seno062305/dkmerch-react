// convex/payments.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ✅ Works in both Node.js and Convex edge runtime (no Buffer dependency)
function toBase64(str: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i = 0;
  const bytes: number[] = [];
  for (let j = 0; j < str.length; j++) bytes.push(str.charCodeAt(j));
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    const b1 = bytes[i] !== undefined ? bytes[i++] : -1;
    const b2 = bytes[i] !== undefined ? bytes[i++] : -1;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 === -1 ? 0 : b1 >> 4)];
    result += b1 === -1 ? "=" : chars[((b1 & 15) << 2) | (b2 === -1 ? 0 : b2 >> 6)];
    result += b2 === -1 ? "=" : chars[b2 & 63];
  }
  return result;
}

// Create a PayMongo checkout session and save to order
export const createPaymentLink = action({
  args: {
    orderId: v.string(),
    amount: v.number(),
    description: v.string(),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    remarks: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, amount, description, customerName, customerEmail, customerPhone, remarks }) => {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) throw new Error("PayMongo secret key not configured");

    const encoded = toBase64(`${secretKey}:`);
    const baseUrl = process.env.SITE_URL || "https://dkmerchwebsite.vercel.app";

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encoded}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing: {
              name:  customerName  || "Customer",
              email: customerEmail || "customer@dkmerch.com",
              phone: customerPhone || "",
            },
            line_items: [{
              currency:    "PHP",
              amount:      Math.round(amount * 100),
              description: description,
              name:        description,
              quantity:    1,
            }],
            payment_method_types: ["gcash", "paymaya"],
            success_url: `${baseUrl}/order-success?orderId=${orderId}`,
            cancel_url:  `${baseUrl}/checkout`,
            description: remarks || orderId,
            send_email_receipt: false,
            show_description:   true,
            show_line_items:    true,
          },
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("PayMongo API error:", JSON.stringify(error));
      throw new Error(`PayMongo error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const session     = data.data;
    const checkoutUrl = session.attributes.checkout_url;

    await ctx.runMutation(api.payments.savePaymentLink, {
      orderId,
      paymentLinkId:  session.id,
      paymentLinkUrl: checkoutUrl,
    });

    return { paymentLinkId: session.id, paymentLinkUrl: checkoutUrl };
  },
});

// Save payment link info to order in DB
export const savePaymentLink = mutation({
  args: {
    orderId:        v.string(),
    paymentLinkId:  v.string(),
    paymentLinkUrl: v.string(),
  },
  handler: async ({ db }, { orderId, paymentLinkId, paymentLinkUrl }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    await db.patch(order._id, { paymentLinkId, paymentLinkUrl, paymentStatus: "pending" });
    return { success: true };
  },
});

// ── Helper: extract payment method from PayMongo response ──
const extractPaymentMethod = (payments: any[], attrs?: any): string => {
  if (payments?.length) {
    const paidPayment = payments.find((p: any) => p.attributes?.status === "paid") || payments[0];
    const fromPayments =
      paidPayment?.attributes?.source?.type ||
      paidPayment?.attributes?.payment_method_type ||
      paidPayment?.attributes?.type ||
      "";
    if (fromPayments) return normalizeMethod(fromPayments);
  }
  const fromIntent =
    attrs?.payment_intent?.attributes?.payment_method_options
      ? Object.keys(attrs.payment_intent.attributes.payment_method_options)[0]
      : "";
  if (fromIntent) return normalizeMethod(fromIntent);
  return "";
};

const normalizeMethod = (raw: string): string => {
  const r = raw.toLowerCase();
  if (r === "gcash")                   return "GCash";
  if (r === "paymaya" || r === "maya") return "Maya";
  if (r === "card" || r === "dob")     return "Card";
  return raw;
};

// Called from OrderSuccess page — checks PayMongo and saves exact payment method
export const checkPaymentStatus = action({
  args: { orderId: v.string() },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (order?.paymentStatus === "paid") return { status: "paid" };

    const secretKey = process.env.PAYMONGO_SECRET_KEY;

    if (secretKey && order?.paymentLinkId) {
      try {
        const encoded  = toBase64(`${secretKey}:`);
        const response = await fetch(
          `https://api.paymongo.com/v1/checkout_sessions/${order.paymentLinkId}`,
          { headers: { Authorization: `Basic ${encoded}` } }
        );

        if (response.ok) {
          const data                = await response.json();
          const attrs               = data.data?.attributes;
          const sessionStatus       = attrs?.status;
          const paymentIntentStatus = attrs?.payment_intent?.attributes?.status;
          const payments: any[]     = attrs?.payments ?? [];
          const hasSucceededPayment = payments.some((p: any) => p.attributes?.status === "paid");

          const paymentMethod = extractPaymentMethod(payments, attrs);

          if (sessionStatus === "completed" || paymentIntentStatus === "succeeded" || hasSucceededPayment) {
            await ctx.runMutation(api.payments.markOrderPaid, { orderId, paymentMethod });
            return { status: "paid", paymentMethod };
          }

          if (!hasSucceededPayment) {
            return { status: "pending", paymentMethod: "" };
          }
        }
      } catch (err) {
        console.warn("PayMongo API check failed:", err);
        return { status: "pending", paymentMethod: "" };
      }
    }

    return { status: "pending", paymentMethod: "" };
  },
});

// Marks order as paid + saves exact payment method
export const markOrderPaid = mutation({
  args: {
    orderId:       v.string(),
    paymentMethod: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, paymentMethod }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    if (order.paymentStatus === "paid") return { success: true };

    const updates: any = {
      paymentStatus: "paid",
      paidAt:        new Date().toISOString(),
    };
    if (paymentMethod) updates.paymentMethod = paymentMethod;

    await db.patch(order._id, updates);
    return { success: true };
  },
});