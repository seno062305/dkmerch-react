// convex/payments.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

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

    const encoded = btoa(`${secretKey}:`);
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
// PayMongo stores method in multiple possible locations depending on API version
const extractPaymentMethod = (payments: any[], attrs?: any): string => {
  // 1. Check payments[] array first (most reliable)
  if (payments?.length) {
    const paidPayment = payments.find((p: any) => p.attributes?.status === "paid") || payments[0];
    const fromPayments =
      paidPayment?.attributes?.source?.type ||           // checkout session payment source
      paidPayment?.attributes?.payment_method_type ||    // payment intent type
      paidPayment?.attributes?.type ||                   // older API
      "";
    if (fromPayments) return normalizeMethod(fromPayments);
  }

  // 2. Fallback: check payment_intent on session
  const fromIntent =
    attrs?.payment_intent?.attributes?.payment_method_options
      ? Object.keys(attrs.payment_intent.attributes.payment_method_options)[0]
      : "";
  if (fromIntent) return normalizeMethod(fromIntent);

  return "";
};

const normalizeMethod = (raw: string): string => {
  const r = raw.toLowerCase();
  if (r === "gcash")            return "GCash";
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
        const encoded  = btoa(`${secretKey}:`);
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

          // Extract exact payment method (GCash / Maya / Card)
          const paymentMethod = extractPaymentMethod(payments, attrs);

          if (sessionStatus === "completed" || paymentIntentStatus === "succeeded" || hasSucceededPayment) {
            await ctx.runMutation(api.payments.markOrderPaid, { orderId, paymentMethod });
            // Return paymentMethod so OrderSuccess.js knows if we got a specific method
            // If empty string, OrderSuccess.js will retry to get the specific method
            return { status: "paid", paymentMethod };
          }

          // Session not yet completed — return pending so caller can retry
          if (!hasSucceededPayment) {
            return { status: "pending", paymentMethod: "" };
          }
        }
      } catch (err) {
        console.warn("PayMongo API check failed, trusting redirect:", err);
      }
    }

    // PayMongo ONLY redirects to success_url after successful payment — trust the redirect
    await ctx.runMutation(api.payments.markOrderPaid, { orderId, paymentMethod: "" });
    return { status: "paid" };
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

    // Save specific payment method if available (GCash / Maya / Card)
    if (paymentMethod) {
      updates.paymentMethod = paymentMethod;
    }

    await db.patch(order._id, updates);
    return { success: true };
  },
});