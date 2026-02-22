// convex/payments.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Create a PayMongo checkout session and save to order
export const createPaymentLink = action({
  args: {
    orderId: v.string(),
    amount: v.number(), // in pesos
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
            line_items: [
              {
                currency:    "PHP",
                amount:      Math.round(amount * 100), // centavos
                description: description,
                name:        description,
                quantity:    1,
              },
            ],
            payment_method_types: ["gcash", "paymaya", "card"],
            success_url: `https://dkmerchwebsite.vercel.app/order-success?orderId=${orderId}`,
            cancel_url:  `https://dkmerchwebsite.vercel.app/checkout`,
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

    return {
      paymentLinkId:  session.id,
      paymentLinkUrl: checkoutUrl,
    };
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
    await db.patch(order._id, {
      paymentLinkId,
      paymentLinkUrl,
      paymentStatus: "pending",
    });
    return { success: true };
  },
});

// Check payment status from PayMongo
export const checkPaymentStatus = action({
  args: { paymentLinkId: v.string(), orderId: v.string() },
  handler: async (ctx, { paymentLinkId, orderId }) => {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) throw new Error("PayMongo secret key not configured");

    const encoded = btoa(`${secretKey}:`);

    const response = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${paymentLinkId}`,
      {
        headers: { Authorization: `Basic ${encoded}` },
      }
    );

    if (!response.ok) throw new Error("Failed to check payment status");

    const data   = await response.json();
    const status = data.data.attributes.payment_intent?.attributes?.status;

    if (status === "succeeded") {
      await ctx.runMutation(api.payments.markOrderPaid, { orderId });
    }

    return { status };
  },
});

// Mark order as paid
export const markOrderPaid = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    await db.patch(order._id, {
      paymentStatus: "paid",
      status:        "Processing",
      paidAt:        new Date().toISOString(),
    });
    return { success: true };
  },
});