// convex/payments.ts
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

async function findProductForOrderItem(db: any, item: any) {
  const raw = item?.id || item?.productId;
  if (!raw) return null;
  try {
    const byId = await db.get(raw as any);
    if (byId && typeof (byId as any).stock === "number") return byId;
  } catch { /* not a doc id */ }
  const all = await db.query("products").collect();
  const key = String(raw);
  return (
    all.find(
      (p: any) =>
        String(p._id) === key
        || String(p.id || "") === key
        || String(p._id) === String(item?.productId || "")
    ) || null
  );
}

/** Check if unpaid order can still take stock (for continue payment). */
export async function evaluateOrderStock(db: any, order: any) {
  if (!order) return { ok: false, message: "Order not found.", shortages: [] as any[] };
  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    return { ok: true, message: "Already paid.", shortages: [] as any[] };
  }
  if (order.isRewardOrder) {
    return { ok: true, message: "Reward order.", shortages: [] as any[] };
  }
  const shortages: { name: string; needed: number; available: number }[] = [];
  for (const item of order.items || []) {
    const qty = Number(item.quantity || item.qty || 1);
    if (qty <= 0) continue;
    const product = await findProductForOrderItem(db, item);
    if (!product) continue;
    const stock = Number((product as any).stock);
    if (!Number.isFinite(stock)) continue;
    if (stock < qty) {
      shortages.push({
        name: String(item.name || (product as any).name || "Item"),
        needed: qty,
        available: Math.max(0, stock),
      });
    }
  }
  if (shortages.length) {
    const detail = shortages
      .map((s) => `${s.name} (need ${s.needed}, left ${s.available})`)
      .join("; ");
    return {
      ok: false,
      message: `Out of stock: ${detail}. Another customer paid first.`,
      shortages,
    };
  }
  return { ok: true, message: "Stock available.", shortages: [] as any[] };
}

async function deductStockForPaidOrder(db: any, order: any) {
  if (!order || order.stockDeducted) return { deducted: false, skipped: true };
  if (order.isRewardOrder) {
    await db.patch(order._id, { stockDeducted: true, stockIssue: false });
    return { deducted: false, skipped: true };
  }
  let stockIssue = false;
  for (const item of order.items || []) {
    const qty = Number(item.quantity || item.qty || 1);
    if (qty <= 0) continue;
    const product = await findProductForOrderItem(db, item);
    if (!product || typeof (product as any).stock !== "number") continue;
    const stock = Number((product as any).stock);
    if (stock < qty) stockIssue = true;
    await db.patch(product._id, { stock: Math.max(0, stock - qty) });
  }
  await db.patch(order._id, { stockDeducted: true, stockIssue });
  return { deducted: true, stockIssue };
}

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

// Create a PayMongo checkout session and save to order.
// Pass paymentMethodType ("gcash" | "paymaya") so hosted checkout skips the
// method picker and goes straight to that wallet authorize page.
export const createPaymentLink = action({
  args: {
    orderId: v.string(),
    amount: v.number(),
    description: v.string(),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    remarks: v.optional(v.string()),
    paymentMethodType: v.optional(v.union(v.literal("gcash"), v.literal("paymaya"))),
    /** Optional overrides so admin/rider "Back to merchant" does not land on customer UI */
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, amount, description, customerName, customerEmail, customerPhone, remarks, paymentMethodType, successUrl, cancelUrl }) => {
    // Re-check stock before opening / refreshing PayMongo (continue payment race)
    const stockCheck = await ctx.runQuery(api.payments.checkOrderStock, { orderId });
    if (stockCheck && stockCheck.ok === false) {
      throw new Error(stockCheck.message || "Items are out of stock.");
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) throw new Error("PayMongo secret key not configured");

    const encoded = toBase64(`${secretKey}:`);
    const rawSite = String(process.env.SITE_URL || "https://dkmerchwebsite.vercel.app").trim().replace(/\/$/, "");
    const baseUrl = (!rawSite || /localhost|127\.0\.0\.1/i.test(rawSite))
      ? "https://dkmerchwebsite.vercel.app"
      : rawSite;
    const methodTypes = paymentMethodType
      ? [paymentMethodType]
      : ["gcash", "paymaya"];

    const resolvedSuccess =
      (successUrl && String(successUrl).trim()) ||
      `${baseUrl}/order-success?orderId=${orderId}`;
    const resolvedCancel =
      (cancelUrl && String(cancelUrl).trim()) ||
      `${baseUrl}/checkout`;

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
            payment_method_types: methodTypes,
            success_url: resolvedSuccess,
            cancel_url:  resolvedCancel,
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
    if (order?.paymentStatus === "paid") {
      return { status: "paid", paymentMethod: order.paymentMethod || "" };
    }

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

/** Client: can this unpaid order still be paid? (continue payment / Pay Now) */
export const checkOrderStock = query({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    return await evaluateOrderStock(db, order);
  },
});

/** Same check as mutation — for click handlers (continue payment). */
export const assertOrderStock = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    return await evaluateOrderStock(db, order);
  },
});

// Marks order as paid + deducts stock once + saves exact payment method
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

    const alreadyPaid = order.paymentStatus === "paid";

    if (!alreadyPaid) {
      const updates: any = {
        paymentStatus: "paid",
        paidAt:        new Date().toISOString(),
      };
      if (paymentMethod) updates.paymentMethod = paymentMethod;
      await db.patch(order._id, updates);
    } else if (paymentMethod && !order.paymentMethod) {
      await db.patch(order._id, { paymentMethod });
    }

    // Deduct stock only after successful payment (idempotent)
    const refreshed = await db.get(order._id);
    await deductStockForPaidOrder(db, refreshed);

    // Points are claimable only after delivery is verified (see rewards.claimOrderPoints)
    return { success: true };
  },
});

/** Refund the original PayMongo payment for an order. Returns { refunded, refundId, error? }. */
async function refundPaymongoPayment(order: any, amount: number, notes: string) {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) return { refunded: false, refundId: "", error: "Refund service unavailable. Please try again later." };
  if (!order.paymentLinkId) {
    return {
      refunded: false,
      refundId: "",
      error: "Cannot auto-refund this payment. Process refund manually then try again.",
    };
  }

  const encoded = toBase64(`${secretKey}:`);
  try {
    const sessionRes = await fetch(
      `https://api.paymongo.com/v1/checkout_sessions/${order.paymentLinkId}`,
      { headers: { Authorization: `Basic ${encoded}` } }
    );
    if (!sessionRes.ok) {
      return { refunded: false, refundId: "", error: "Could not verify payment for refund. Try again." };
    }
    const sessionData = await sessionRes.json();
    const payments: any[] = sessionData?.data?.attributes?.payments ?? [];
    const paidPayment =
      payments.find((p: any) => p?.attributes?.status === "paid") || payments[0];
    const paymentId = paidPayment?.id;
    if (!paymentId) {
      return { refunded: false, refundId: "", error: "Payment record not found for refund. Contact support." };
    }

    const refundRes = await fetch("https://api.paymongo.com/v1/refunds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${encoded}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100),
            payment_id: paymentId,
            reason: "requested_by_customer",
            notes,
          },
        },
      }),
    });

    if (!refundRes.ok) {
      const errBody = await refundRes.json().catch(() => ({}));
      console.error("PayMongo refund error:", JSON.stringify(errBody));
      const detail =
        errBody?.errors?.[0]?.detail ||
        errBody?.errors?.[0]?.title ||
        "Refund failed";
      return { refunded: false, refundId: "", error: `Refund failed: ${detail}` };
    }

    const refundData = await refundRes.json();
    return { refunded: true, refundId: refundData?.data?.id || "", error: "" };
  } catch (err: any) {
    console.error("PayMongo refund exception:", err);
    return { refunded: false, refundId: "", error: "Refund request failed. Please try again." };
  }
}

/**
 * Admin pays damage refund back via PayMongo (same wallet path as customer payment).
 */
export const approveDamageRefund = action({
  args: {
    orderId: v.string(),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, adminNote }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found." };
    if (order.refundStatus !== "requested") {
      return { success: false, error: "No pending refund request for this order." };
    }

    const amount = Number(order.finalTotal ?? order.total ?? order.refundAmount ?? 0);
    if (!(amount > 0)) return { success: false, error: "Invalid refund amount." };

    const pay = await refundPaymongoPayment(order, amount, `Damage refund ${orderId}`);
    if (!pay.refunded) {
      return { success: false, error: pay.error || "PayMongo refund failed." };
    }

    const result = await ctx.runMutation(api.orders.resolveRefund, {
      orderId,
      refundStatus: "approved",
      refundAdminNote: adminNote || `PayMongo refund ${pay.refundId}`,
    });

    if (!result?.success) {
      return {
        success: false,
        error: "PayMongo refund succeeded but order update failed. Contact support.",
        refunded: true,
        refundId: pay.refundId,
      };
    }

    return {
      success: true,
      refunded: true,
      refundAmount: amount,
      refundId: pay.refundId,
    };
  },
});

/**
 * Admin approves a customer cancel request.
 * If paid → refund via PayMongo, then finalize cancel.
 */
export const approveCustomerCancel = action({
  args: {
    orderId: v.string(),
    adminNote: v.optional(v.string()),
    proofPhotoId: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, adminNote, proofPhotoId }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found." };

    if (order.cancelRequestStatus !== "requested") {
      return { success: false, error: "No pending cancel request for this order." };
    }

    const status = String(order.orderStatus || order.status || "").toLowerCase();
    if (status === "cancelled") {
      return { success: false, error: "Order is already cancelled." };
    }

    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const amount = Number(order.finalTotal ?? order.total ?? 0);
    let refunded = false;
    let refundId = "";

    if (wasPaid && amount > 0) {
      const pay = await refundPaymongoPayment(order, amount, `Admin approved cancel ${orderId}`);
      if (!pay.refunded) {
        // Allow manual proof fallback when PayMongo auto-refund is unavailable
        if (!proofPhotoId) {
          return {
            success: false,
            error: pay.error || "PayMongo refund failed. Upload proof or try again.",
          };
        }
      } else {
        refunded = true;
        refundId = pay.refundId;
      }
    }

    const result = await ctx.runMutation(api.orders.applyCustomerCancel, {
      orderId,
      refunded,
      refundId: refundId || undefined,
      refundAmount: wasPaid ? amount : 0,
      adminNote: adminNote || undefined,
      proofPhotoId: proofPhotoId || undefined,
    });

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || "Cancel failed after refund. Contact support.",
        refunded,
        refundId,
      };
    }

    return {
      success: true,
      refunded,
      refundAmount: wasPaid ? amount : 0,
      refundId,
    };
  },
});