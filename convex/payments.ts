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

/** Soft lock while PayMongo checkout is open. */
export const PAYMENT_HOLD_MS = 5 * 60 * 1000;

function formatHoldWait(ms: number) {
  const sec = Math.max(1, Math.ceil(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Active payment-hold qty for a product (lazy-deletes expired rows). */
export async function activeHoldQtyForProduct(
  db: any,
  productId: string,
  excludeOrderId?: string
) {
  const now = Date.now();
  const rows = await db
    .query("paymentHolds")
    .withIndex("by_productId", (q: any) => q.eq("productId", String(productId)))
    .collect();
  let held = 0;
  let latestExpiry = 0;
  for (const row of rows) {
    if (Number(row.expiresAt) <= now) {
      await db.delete(row._id);
      continue;
    }
    if (excludeOrderId && String(row.orderId) === String(excludeOrderId)) continue;
    held += Math.max(0, Math.floor(Number(row.qty) || 0));
    latestExpiry = Math.max(latestExpiry, Number(row.expiresAt) || 0);
  }
  return { held, latestExpiry };
}

/** Sellable = on-hand stock minus other customers' active payment holds. */
export async function sellableStockForProduct(
  db: any,
  product: any,
  excludeOrderId?: string
) {
  const onHand = Number((product as any)?.stock);
  if (!Number.isFinite(onHand)) return { available: Infinity, latestExpiry: 0, held: 0 };
  const { held, latestExpiry } = await activeHoldQtyForProduct(
    db,
    String(product._id),
    excludeOrderId
  );
  return { available: Math.max(0, onHand - held), latestExpiry, held };
}

export async function clearPaymentHoldsForOrder(db: any, orderId: string) {
  const rows = await db
    .query("paymentHolds")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", String(orderId)))
    .collect();
  for (const row of rows) await db.delete(row._id);
}

/** Check if unpaid order can still take stock (for continue payment). */
export async function evaluateOrderStock(db: any, order: any) {
  if (!order) return { ok: false, message: "Order not found.", shortages: [] as any[], blocked: false };
  if (String(order.paymentStatus || "").toLowerCase() === "paid") {
    return { ok: true, message: "Already paid.", shortages: [] as any[], blocked: false };
  }
  if (order.isRewardOrder) {
    return { ok: true, message: "Reward order.", shortages: [] as any[], blocked: false };
  }
  const shortages: { name: string; needed: number; available: number }[] = [];
  let blockExpiry = 0;
  let blockedByHold = false;
  for (const item of order.items || []) {
    const qty = Number(item.quantity || item.qty || 1);
    if (qty <= 0) continue;
    const product = await findProductForOrderItem(db, item);
    if (!product) continue;
    const { available, latestExpiry, held } = await sellableStockForProduct(
      db,
      product,
      String(order.orderId || "")
    );
    if (!Number.isFinite(available)) continue;
    if (available < qty) {
      shortages.push({
        name: String(item.name || (product as any).name || "Item"),
        needed: qty,
        available: Math.max(0, available),
      });
      if (held > 0 && latestExpiry > Date.now()) {
        blockedByHold = true;
        blockExpiry = Math.max(blockExpiry, latestExpiry);
      }
    }
  }
  if (shortages.length) {
    const detail = shortages
      .map((s) => `${s.name} (need ${s.needed}, left ${s.available})`)
      .join("; ");
    if (blockedByHold && blockExpiry > Date.now()) {
      const wait = formatHoldWait(blockExpiry - Date.now());
      return {
        ok: false,
        blocked: true,
        message: `Another customer is currently on PayMongo for this item. If they cancel or go back, you can pay right away (unlocks in about ${wait} if they stay).`,
        retryAfterSec: Math.max(1, Math.ceil((blockExpiry - Date.now()) / 1000)),
        expiresAt: blockExpiry,
        shortages,
      };
    }
    return {
      ok: false,
      blocked: false,
      message: `Out of stock: ${detail}.`,
      shortages,
    };
  }
  return { ok: true, message: "Stock available.", shortages: [] as any[], blocked: false };
}

/** Idempotent stock deduct after a paid sale (online or walk-in). */
export async function deductStockForPaidOrder(db: any, order: any) {
  if (!order || order.stockDeducted) return { deducted: false, skipped: true };
  if (order.isRewardOrder) {
    await db.patch(order._id, { stockDeducted: true, stockIssue: false });
    await clearPaymentHoldsForOrder(db, String(order.orderId || ""));
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
  await clearPaymentHoldsForOrder(db, String(order.orderId || ""));
  return { deducted: true, stockIssue };
}

export { findProductForOrderItem };

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
    // Soft-lock stock for 5 minutes — blocks other buyers from starting PayMongo
    const hold = await ctx.runMutation(api.payments.acquirePaymentHold, { orderId });
    if (hold && hold.ok === false) {
      return {
        ok: false,
        blocked: !!hold.blocked,
        message: hold.message || "Items are unavailable for payment right now.",
        retryAfterSec: hold.retryAfterSec || 0,
        expiresAt: hold.expiresAt || 0,
      };
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

    let response;
    try {
      response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
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
    } catch (err) {
      // Never leave a hold if PayMongo never opened
      await ctx.runMutation(api.payments.releasePaymentHold, { orderId });
      throw err;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("PayMongo API error:", JSON.stringify(error));
      await ctx.runMutation(api.payments.releasePaymentHold, { orderId });
      throw new Error(`PayMongo error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const session     = data.data;
    const checkoutUrl = session.attributes.checkout_url;
    if (!checkoutUrl) {
      await ctx.runMutation(api.payments.releasePaymentHold, { orderId });
      throw new Error("PayMongo did not return a checkout URL.");
    }

    await ctx.runMutation(api.payments.savePaymentLink, {
      orderId,
      paymentLinkId:  session.id,
      paymentLinkUrl: checkoutUrl,
    });

    return {
      ok: true,
      paymentLinkId: session.id,
      paymentLinkUrl: checkoutUrl,
      holdExpiresAt: hold?.expiresAt || 0,
    };
  },
});

/** Lock order items for PAYMENT_HOLD_MS so others cannot start paying. */
export const acquirePaymentHold = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { ok: false, blocked: false, message: "Order not found." };
    if (String(order.paymentStatus || "").toLowerCase() === "paid") {
      return { ok: true, skipped: true, expiresAt: 0 };
    }
    if (order.isRewardOrder) return { ok: true, skipped: true, expiresAt: 0 };

    const stockCheck = await evaluateOrderStock(db, order);
    if (!stockCheck.ok) {
      return {
        ok: false,
        blocked: !!stockCheck.blocked,
        message: stockCheck.message,
        retryAfterSec: stockCheck.retryAfterSec || 0,
        expiresAt: stockCheck.expiresAt || 0,
      };
    }

    const now = Date.now();
    const expiresAt = now + PAYMENT_HOLD_MS;
    await clearPaymentHoldsForOrder(db, orderId);

    // Touch products before inserting holds so concurrent acquires conflict (OCC retry)
    // and the loser re-runs evaluateOrderStock after the winner's holds exist.
    const holdRows: {
      productId: string;
      productName: string;
      qty: number;
    }[] = [];
    for (const item of order.items || []) {
      const qty = Math.max(0, Math.floor(Number(item.quantity || item.qty || 1)));
      if (qty <= 0) continue;
      const product = await findProductForOrderItem(db, item);
      if (!product || typeof (product as any).stock !== "number") continue;
      await db.patch(product._id, {
        paymentHoldStamp: now,
      } as any);
      holdRows.push({
        productId: String(product._id),
        productName: String(item.name || (product as any).name || "Item"),
        qty,
      });
    }

    // Re-check after product locks — blocks the concurrent loser immediately
    const stockCheck2 = await evaluateOrderStock(db, order);
    if (!stockCheck2.ok) {
      return {
        ok: false,
        blocked: !!stockCheck2.blocked,
        message: stockCheck2.message,
        retryAfterSec: stockCheck2.retryAfterSec || 0,
        expiresAt: stockCheck2.expiresAt || 0,
      };
    }

    for (const row of holdRows) {
      await db.insert("paymentHolds", {
        orderId: String(orderId),
        productId: row.productId,
        productName: row.productName,
        qty: row.qty,
        createdAt: now,
        expiresAt,
      });
    }

    await db.patch(order._id, {
      paymentHoldUntil: expiresAt,
    } as any);

    return { ok: true, expiresAt, holdMs: PAYMENT_HOLD_MS };
  },
});

export const releasePaymentHold = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    await clearPaymentHoldsForOrder(db, orderId);
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (order) await db.patch(order._id, { paymentHoldUntil: undefined } as any);
    return { success: true };
  },
});

/**
 * Customer left PayMongo without paying — cancel the unpaid checkout row so
 * admin Pending does not keep stacking when they try again later.
 * Paid orders are never touched.
 */
export const abandonUnpaidCheckout = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const id = String(orderId || "").trim();
    if (!id) return { success: false, reason: "missing_order" };

    await clearPaymentHoldsForOrder(db, id);

    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", id))
      .first();
    if (!order) return { success: false, reason: "not_found" };

    if (String(order.paymentStatus || "").toLowerCase() === "paid") {
      return { success: false, reason: "already_paid" };
    }

    const st = String(order.orderStatus || order.status || "").toLowerCase();
    if (st === "cancelled" || st === "canceled") {
      await db.patch(order._id, { paymentHoldUntil: undefined } as any);
      return { success: true, alreadyCancelled: true };
    }
    if (st && st !== "pending" && st !== "pending payment") {
      await db.patch(order._id, { paymentHoldUntil: undefined } as any);
      return { success: false, reason: "not_pending" };
    }

    const now = new Date().toISOString();
    await db.patch(order._id, {
      status: "Cancelled",
      orderStatus: "cancelled",
      paymentStatus: "cancelled",
      paymentHoldUntil: undefined,
      cancelledAt: now,
      cancelledBy: "customer",
      cancelReason: "Left payment before completing PayMongo checkout",
    } as any);

    // Undo promo usedCount from createOrder (cancelled orders don't count as a use)
    const promoCode = String(order.promoCode || "").toUpperCase().trim();
    if (promoCode) {
      const promo = await db
        .query("promos")
        .withIndex("by_code", (q) => q.eq("code", promoCode))
        .first();
      if (promo) {
        await db.patch(promo._id, {
          usedCount: Math.max(0, Number(promo.usedCount || 0) - 1),
        });
      }
    }

    return { success: true, cancelled: true };
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
          const paymentIntentStatus = attrs?.payment_intent?.attributes?.status;
          const payments: any[]     = attrs?.payments ?? [];
          const hasSucceededPayment = payments.some((p: any) => p.attributes?.status === "paid");

          const paymentMethod = extractPaymentMethod(payments, attrs);

          // Only mark paid when PayMongo confirms a real payment —
          // never on browser redirect alone (back-out without paying).
          if (hasSucceededPayment || paymentIntentStatus === "succeeded") {
            const paid = await ctx.runMutation(api.payments.markOrderPaid, { orderId, paymentMethod });
            return {
              status: "paid",
              paymentMethod,
              stockIssue: !!paid?.stockIssue,
            };
          }

          return { status: "pending", paymentMethod: "" };
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

/**
 * Restore stock taken by unpaid orders under the old "deduct at checkout" path.
 * New orders (after stock-on-pay) never hold stock until paid — so unpaid must
 * not block other customers. Safe to re-run (stockLegacyRestored guard).
 */
export const repairUnpaidLegacyStockHolds = mutation({
  args: {
    /** Re-restore unpaid holds even if stockLegacyRestored was set (cutoff false-positive). */
    force: v.optional(v.boolean()),
  },
  handler: async ({ db }, { force }) => {
    // Old checkout deducted stock before pay without stockDeducted.
    // Unpaid orders must not keep stock away from new buyers.
    const orders = await db.query("orders").collect();
    let restoredOrders = 0;
    let units = 0;
    let skipped = 0;
    for (const order of orders) {
      if (order.stockDeducted) { skipped += 1; continue; }
      if (String(order.paymentStatus || "").toLowerCase() === "paid") {
        if (!(order as any).stockLegacyRestored) {
          await db.patch(order._id, { stockLegacyRestored: true });
        }
        skipped += 1;
        continue;
      }
      const status = String(order.orderStatus || order.status || "").toLowerCase().replace(/\s+/g, "_");
      if (status.includes("cancel")) {
        if (!(order as any).stockLegacyRestored) {
          await db.patch(order._id, { stockLegacyRestored: true });
        }
        skipped += 1;
        continue;
      }
      if (order.isRewardOrder) {
        if (!(order as any).stockLegacyRestored) {
          await db.patch(order._id, { stockLegacyRestored: true });
        }
        skipped += 1;
        continue;
      }
      if ((order as any).stockLegacyRestored && !force) { skipped += 1; continue; }

      for (const item of order.items || []) {
        const qty = Number(item.quantity || item.qty || 1);
        if (qty <= 0) continue;
        const product = await findProductForOrderItem(db, item);
        if (!product || typeof (product as any).stock !== "number") continue;
        await db.patch(product._id, {
          stock: Number((product as any).stock) + qty,
        });
        units += qty;
      }
      await db.patch(order._id, { stockLegacyRestored: true });
      restoredOrders += 1;
    }
    return { restoredOrders, units, skipped, forced: !!force };
  },
});

// Marks order as paid + deducts stock once + saves exact payment method
export const markOrderPaid = mutation({
  args: {
    orderId:       v.string(),
    paymentMethod: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderId, paymentMethod }) => {
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
        paymentHoldUntil: undefined,
      };
      if (paymentMethod) updates.paymentMethod = paymentMethod;
      await db.patch(order._id, updates);
    } else if (paymentMethod && !order.paymentMethod) {
      await db.patch(order._id, { paymentMethod });
    }

    // Deduct stock only after successful payment (idempotent)
    const refreshed = await db.get(order._id);
    const deductResult = await deductStockForPaidOrder(db, refreshed);

    // Payment Received email ONLY after fully paid (never on payment-link create / cancel)
    const paidOrder = (await db.get(order._id)) || refreshed;
    if (
      paidOrder
      && String(paidOrder.paymentStatus || "").toLowerCase() === "paid"
      && paidOrder.email
      && !(paidOrder as any).paymentReceivedEmailSent
    ) {
      await db.patch(paidOrder._id, { paymentReceivedEmailSent: true } as any);
      const items = (paidOrder.items || []).map((i: any) => ({
        name: String(i.name || "Item"),
        price: Number(i.price || 0),
        quantity: Number(i.quantity || i.qty || 1),
      }));
      await scheduler.runAfter(0, api.sendEmail.sendPaymentReceivedEmail, {
        to: String(paidOrder.email),
        name: String(paidOrder.customerName || paidOrder.email || "Customer"),
        orderId: String(paidOrder.orderId || orderId),
        items,
        total: Number(paidOrder.total || paidOrder.finalTotal || 0),
        promoCode: paidOrder.promoCode || undefined,
        discountAmount:
          paidOrder.discountAmount != null
            ? Number(paidOrder.discountAmount)
            : undefined,
        finalTotal:
          paidOrder.finalTotal != null
            ? Number(paidOrder.finalTotal)
            : undefined,
        shippingFee:
          paidOrder.shippingFee != null
            ? Number(paidOrder.shippingFee)
            : undefined,
      });
    }

    const latest = (await db.get(order._id)) || paidOrder;
    // Points are claimable only after delivery is verified (see rewards.claimOrderPoints)
    return {
      success: true,
      newlyPaid: !alreadyPaid,
      stockIssue: !!(deductResult as any)?.stockIssue || !!(latest as any)?.stockIssue,
    };
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
 * Step 1 — Admin Return Payment via PayMongo.
 * Opens hosted checkout (like customer). Does NOT mark paid if admin backs out.
 * Only records success when API refund works OR confirmReturnPayment sees checkout paid.
 */
export const processDamageRefundPay = action({
  args: {
    orderId: v.string(),
    /** Origin-based URLs from admin browser so Continue to Merchant keeps same session */
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, successUrl, cancelUrl }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found." };

    const status = String(order.orderStatus || order.status || "").toLowerCase();
    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const isPaidPending = wasPaid && (!status || status === "pending" || status === "pending payment");
    const isDamageRefund = order.refundStatus === "requested";
    const isFailedDelivery = !!(order as any).deliveryFailedFinal
      || String((order as any).status || "").toLowerCase() === "failed delivery"
      || status === "failed_delivery";
    const failedDeliveryAwaiting = isFailedDelivery
      && wasPaid
      && (!order.refundStatus || order.refundStatus === "requested");

    if (!isDamageRefund && !isPaidPending && !failedDeliveryAwaiting) {
      return { success: false, error: "No pending refund / Return Payment for this order." };
    }

    // Prefer stored refundAmount (failed delivery = product only, shipping excluded)
    let amount = Number(order.refundAmount ?? 0);
    if (!(amount > 0) && isFailedDelivery) {
      const shipping = Number((order as any).shippingFee ?? 0);
      const total = Number(order.finalTotal ?? order.total ?? 0);
      amount = (order as any).subtotal != null
        ? Math.max(0, Number((order as any).subtotal))
        : Math.max(0, total - (Number.isFinite(shipping) ? shipping : 0));
    }
    if (!(amount > 0)) amount = Number(order.finalTotal ?? order.total ?? 0);
    if (!(amount > 0)) return { success: false, error: "Invalid refund amount." };

    // Ensure failed-delivery orders have an open refund request for Return Payment UI
    if (failedDeliveryAwaiting && order.refundStatus !== "requested") {
      await ctx.runMutation(api.orders.ensureFailedDeliveryRefund, { orderId });
    }

    // Already confirmed return
    if (order.paymongoRefundId || order.refundPayStartedAt) {
      return {
        success: true,
        refunded: !!order.paymongoRefundId,
        payConfirmed: true,
        refundAmount: amount,
        refundId: order.paymongoRefundId || "",
        checkoutUrl: order.returnPaymentLinkUrl || "",
      };
    }

    let refunded = false;
    let refundId = "";

    // Try silent API refund on original payment first
    const pay = await refundPaymongoPayment(order, amount, `Return Payment ${orderId}`);
    if (pay.refunded) {
      refunded = true;
      refundId = pay.refundId;
      await ctx.runMutation(api.orders.recordDamageRefundPayment, {
        orderId,
        refundId: refundId || undefined,
      });
      return {
        success: true,
        refunded: true,
        payConfirmed: true,
        refundAmount: amount,
        refundId,
        checkoutUrl: "",
      };
    }

    // No auto-refund — open hosted PayMongo (do NOT mark paid yet).
    // Always create a fresh session when client passes success/cancel URLs so
    // Continue to Merchant returns to this admin origin (avoids logout / wrong host).
    const forceFreshCheckout = !!(successUrl || cancelUrl);
    let checkoutUrl = forceFreshCheckout ? "" : (order.returnPaymentLinkUrl || "");
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (secretKey && !checkoutUrl) {
      try {
        const encoded = toBase64(`${secretKey}:`);
        const rawSite = String(process.env.SITE_URL || "https://dkmerchwebsite.vercel.app").trim().replace(/\/$/, "");
        const baseUrl = (!rawSite || /localhost|127\.0\.0\.1/i.test(rawSite))
          ? "https://dkmerchwebsite.vercel.app"
          : rawSite;
        const methodRaw = String(order.refundMethod || order.paymentMethod || order.paymentFeeMethod || "").toLowerCase();
        const paymentMethodType = methodRaw.includes("maya")
          ? "paymaya"
          : methodRaw.includes("gcash")
            ? "gcash"
            : undefined;
        const methodTypes = paymentMethodType ? [paymentMethodType] : ["gcash", "paymaya"];
        const desc = `Return Payment · DKMerch Order ${orderId}`;
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
                  name: order.customerName || order.refundAccountName || "Customer",
                  email: order.email || "customer@dkmerch.com",
                  phone: order.refundAccountNumber || order.phone || "",
                },
                line_items: [{
                  currency: "PHP",
                  amount: Math.round(amount * 100),
                  description: desc,
                  name: desc,
                  quantity: 1,
                }],
                payment_method_types: methodTypes,
                success_url: (successUrl && String(successUrl).trim())
                  || `${baseUrl}/paymongo-return.html?returnPay=success&tab=refunds&orderId=${encodeURIComponent(orderId)}`,
                cancel_url: (cancelUrl && String(cancelUrl).trim())
                  || `${baseUrl}/paymongo-return.html?returnPay=cancel&tab=refunds&orderId=${encodeURIComponent(orderId)}`,
                description: desc,
                send_email_receipt: false,
                show_description: true,
                show_line_items: true,
              },
            },
          }),
        });
        if (response.ok) {
          const data = await response.json();
          const session = data.data;
          checkoutUrl = session?.attributes?.checkout_url || "";
          if (checkoutUrl && session?.id) {
            await ctx.runMutation(api.orders.saveReturnPaymentLink, {
              orderId,
              returnPaymentLinkId: session.id,
              returnPaymentLinkUrl: checkoutUrl,
            });
          }
        } else {
          const errBody = await response.json().catch(() => ({}));
          console.error("Return Payment checkout error:", JSON.stringify(errBody));
        }
      } catch (err) {
        console.error("Return Payment checkout exception:", err);
      }
    }

    if (!checkoutUrl && order.returnPaymentLinkUrl) {
      checkoutUrl = order.returnPaymentLinkUrl;
    }

    // Link saved for Continue — payment NOT confirmed until confirmReturnPayment / success
    return {
      success: true,
      refunded: false,
      payConfirmed: false,
      refundAmount: amount,
      refundId: "",
      checkoutUrl: checkoutUrl || "",
      continuePayment: !!checkoutUrl,
      error: pay.error || "",
    };
  },
});

/**
 * Confirm Return Payment only after PayMongo checkout is actually paid
 * (or reuse if already recorded). Backing out of PayMongo does nothing.
 */
export const confirmReturnPayment = action({
  args: {
    orderId: v.string(),
  },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found.", payConfirmed: false };

    if (order.paymongoRefundId || order.refundPayStartedAt) {
      return {
        success: true,
        payConfirmed: true,
        refundId: order.paymongoRefundId || "",
        alreadyConfirmed: true,
      };
    }

    const sessionId = order.returnPaymentLinkId;
    if (!sessionId) {
      return { success: false, error: "No Return Payment session yet. Click Return Payment first.", payConfirmed: false };
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) return { success: false, error: "PayMongo not configured.", payConfirmed: false };

    const encoded = toBase64(`${secretKey}:`);
    try {
      const sessionRes = await fetch(
        `https://api.paymongo.com/v1/checkout_sessions/${sessionId}`,
        { headers: { Authorization: `Basic ${encoded}` } }
      );
      if (!sessionRes.ok) {
        return { success: false, error: "Could not verify PayMongo session.", payConfirmed: false };
      }
      const sessionData = await sessionRes.json();
      const attrs = sessionData?.data?.attributes || {};
      const payments: any[] = attrs.payments ?? [];
      const paid =
        String(attrs.payment_status || "").toLowerCase() === "paid"
        || payments.some((p: any) => String(p?.attributes?.status || "").toLowerCase() === "paid");

      if (!paid) {
        return {
          success: false,
          payConfirmed: false,
          pending: true,
          error: "PayMongo not completed yet. Continue payment or try again.",
          checkoutUrl: order.returnPaymentLinkUrl || "",
        };
      }

      await ctx.runMutation(api.orders.recordDamageRefundPayment, {
        orderId,
        refundId: payments.find((p: any) => p?.attributes?.status === "paid")?.id || sessionId,
      });

      return {
        success: true,
        payConfirmed: true,
        refundAmount: Number(order.refundAmount ?? order.finalTotal ?? order.total ?? 0),
        checkoutUrl: order.returnPaymentLinkUrl || "",
      };
    } catch (err: any) {
      console.error("confirmReturnPayment:", err);
      return { success: false, error: "Could not verify Return Payment.", payConfirmed: false };
    }
  },
});

/**
 * Step 2 — After payment confirmed, admin finalizes (proof optional for testing).
 */
export const approveDamageRefund = action({
  args: {
    orderId: v.string(),
    adminNote: v.optional(v.string()),
    proofPhotoId: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, adminNote, proofPhotoId }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found." };
    if (order.refundStatus !== "requested") {
      return { success: false, error: "No pending refund request for this order." };
    }

    const amount = Number(order.refundAmount ?? order.finalTotal ?? order.total ?? 0);
    if (!(amount > 0)) return { success: false, error: "Invalid refund amount." };

    // Proof optional while testing
    let refunded = !!order.paymongoRefundId || !!order.refundPayStartedAt;
    let refundId = order.paymongoRefundId || "";

    if (!refunded) {
      const pay = await refundPaymongoPayment(order, amount, `Damage refund ${orderId}`);
      if (pay.refunded) {
        refunded = true;
        refundId = pay.refundId;
      }
    }

    const result = await ctx.runMutation(api.orders.resolveRefund, {
      orderId,
      refundStatus: "approved",
      refundAdminNote: adminNote || undefined,
      proofPhotoId: proofPhotoId || undefined,
      refunded,
      refundId: refundId || undefined,
    });

    if (!result?.success) {
      return {
        success: false,
        error: result?.error || "Could not finalize refund. Contact support.",
        refunded,
        refundId,
      };
    }

    return {
      success: true,
      refunded,
      refundAmount: amount,
      refundId,
    };
  },
});

/**
 * Admin cancels an order before confirm (pending).
 * Unpaid → cancel immediately.
 * Paid → require proof screenshot + PayMongo refund to same GCash/Maya rails, then cancel.
 */
export const adminCancelOrder = action({
  args: {
    orderId: v.string(),
    reason: v.string(),
    proofPhotoId: v.optional(v.string()),
  },
  handler: async (ctx, { orderId, reason, proofPhotoId }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, error: "Order not found." };

    const status = String(order.orderStatus || order.status || "").toLowerCase();
    if (status === "cancelled") {
      return { success: false, error: "Order is already cancelled." };
    }
    if (status === "completed") {
      return { success: false, error: "Completed orders cannot be cancelled." };
    }
    if (status === "shipped" || status === "out_for_delivery") {
      return {
        success: false,
        error: "Cannot cancel while the order is shipped / out for delivery.",
      };
    }

    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const isUnconfirmed = !status || status === "pending" || status === "pending payment";
    // Cancel only before admin confirms (paid or unpaid)
    if (!isUnconfirmed) {
      return {
        success: false,
        error: "Order is already confirmed — cancel is no longer allowed.",
      };
    }

    // Proof optional while testing

    const amount = Number(order.finalTotal ?? order.total ?? 0);
    let refunded = false;
    let refundId = "";

    if (wasPaid && amount > 0) {
      if (order.paymongoRefundId || order.refundPayStartedAt) {
        refunded = !!order.paymongoRefundId || !!order.refundPayStartedAt;
        refundId = order.paymongoRefundId || "";
      } else {
        const pay = await refundPaymongoPayment(order, amount, `Admin cancel ${orderId}`);
        if (pay.refunded) {
          refunded = true;
          refundId = pay.refundId;
        }
      }
    }

    const result = await ctx.runMutation(api.orders.applyAdminCancel, {
      orderId,
      reason,
      refunded,
      refundId: refundId || undefined,
      refundAmount: wasPaid ? amount : 0,
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