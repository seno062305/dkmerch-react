// convex/payments.ts
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { insertCustomerNotification } from "./customerNotifications";

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

export const RESTOCK_ETA_LABEL = "2–3 weeks";

/** Qty held by paid reserved / choice-needed oversell orders (not yet deducted). */
export async function reservedQtyForProduct(db: any, product: any) {
  if (!product?._id) return 0;
  const pid = String(product._id);
  const alt = String((product as any).id || "");
  const orders = await db.query("orders").collect();
  let held = 0;
  for (const order of orders) {
    const st = String((order as any).oversellStatus || "");
    if (st !== "reserved" && st !== "choice_needed" && st !== "refund_pending") continue;
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") continue;
    for (const item of order.items || []) {
      const raw = String(item?.id || item?.productId || "");
      if (!raw) continue;
      if (raw !== pid && raw !== alt && String(item?.productId || "") !== pid) continue;
      held += Math.max(0, Math.floor(Number(item.quantity || item.qty || 1)));
    }
  }
  return held;
}

/** Sellable units = on-hand stock minus reserved oversell claims. */
export async function sellableStockForProduct(db: any, product: any) {
  const onHand = Number((product as any)?.stock);
  if (!Number.isFinite(onHand)) return Infinity;
  const held = await reservedQtyForProduct(db, product);
  return Math.max(0, onHand - held);
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
    const available = await sellableStockForProduct(db, product);
    if (!Number.isFinite(available)) continue;
    if (available < qty) {
      shortages.push({
        name: String(item.name || (product as any).name || "Item"),
        needed: qty,
        available: Math.max(0, available),
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

async function collectPaidShortages(db: any, order: any) {
  const shortages: { name: string; needed: number; available: number; productId?: string }[] = [];
  for (const item of order.items || []) {
    const qty = Number(item.quantity || item.qty || 1);
    if (qty <= 0) continue;
    const product = await findProductForOrderItem(db, item);
    if (!product || typeof (product as any).stock !== "number") continue;
    const stock = Number((product as any).stock);
    if (stock < qty) {
      shortages.push({
        name: String(item.name || (product as any).name || "Item"),
        needed: qty,
        available: Math.max(0, stock),
        productId: String(product._id),
      });
    }
  }
  return shortages;
}

/** Idempotent stock deduct after a paid sale (online or walk-in). */
export async function deductStockForPaidOrder(db: any, order: any) {
  if (!order || order.stockDeducted) return { deducted: false, skipped: true };
  const oversell = String((order as any).oversellStatus || "");
  if (
    oversell === "choice_needed"
    || oversell === "reserved"
    || oversell === "refund_pending"
    || oversell === "refunded"
  ) {
    return { deducted: false, skipped: true, stockIssue: true, needsOversellChoice: oversell === "choice_needed" };
  }
  if (order.isRewardOrder) {
    await db.patch(order._id, { stockDeducted: true, stockIssue: false });
    return { deducted: false, skipped: true };
  }

  const shortages = await collectPaidShortages(db, order);
  if (shortages.length) {
    // Do NOT clamp/oversell — paid customer must choose refund or reserve.
    await db.patch(order._id, {
      stockIssue: true,
      oversellStatus: "choice_needed",
      orderStatus: "awaiting_restock_choice",
      status: "Awaiting Restock Choice",
      restockEtaLabel: RESTOCK_ETA_LABEL,
      oversellDetectedAt: new Date().toISOString(),
      oversellShortages: shortages,
    } as any);
    if (order.email) {
      await insertCustomerNotification(db, {
        email: String(order.email),
        type: "oversell_choice",
        title: "Item sold out — choose next step",
        body: `Order ${order.orderId} was paid, but stock was taken by another buyer. Choose a refund or reserve for the next restock (about ${RESTOCK_ETA_LABEL}).`,
        url: `/track-order?orderId=${encodeURIComponent(String(order.orderId))}`,
        orderId: String(order.orderId),
      });
    }
    return { deducted: false, stockIssue: true, needsOversellChoice: true, shortages };
  }

  for (const item of order.items || []) {
    const qty = Number(item.quantity || item.qty || 1);
    if (qty <= 0) continue;
    const product = await findProductForOrderItem(db, item);
    if (!product || typeof (product as any).stock !== "number") continue;
    const stock = Number((product as any).stock);
    await db.patch(product._id, { stock: Math.max(0, stock - qty) });
  }
  await db.patch(order._id, { stockDeducted: true, stockIssue: false });
  return { deducted: true, stockIssue: false };
}

/** After restock: assign on-hand units to reserved orders (FIFO). */
export async function tryFulfillReservedOrders(db: any, productId?: string) {
  const orders = await db.query("orders").collect();
  const reserved = orders
    .filter((o: any) =>
      String(o.oversellStatus || "") === "reserved"
      && String(o.paymentStatus || "").toLowerCase() === "paid"
      && !o.stockDeducted
    )
    .sort((a: any, b: any) => {
      const ta = new Date(a.reservedAt || a.oversellDetectedAt || 0).getTime();
      const tb = new Date(b.reservedAt || b.oversellDetectedAt || 0).getTime();
      return ta - tb;
    });

  let fulfilled = 0;
  for (const order of reserved) {
    if (productId) {
      const touches = (order.items || []).some((item: any) => {
        const raw = String(item?.id || item?.productId || "");
        return raw === String(productId) || String(item?.productId || "") === String(productId);
      });
      if (!touches) continue;
    }
    const shortages = await collectPaidShortages(db, order);
    if (shortages.length) continue;

    for (const item of order.items || []) {
      const qty = Number(item.quantity || item.qty || 1);
      if (qty <= 0) continue;
      const product = await findProductForOrderItem(db, item);
      if (!product || typeof (product as any).stock !== "number") continue;
      const stock = Number((product as any).stock);
      await db.patch(product._id, { stock: Math.max(0, stock - qty) });
    }
    const now = new Date().toISOString();
    await db.patch(order._id, {
      stockDeducted: true,
      stockIssue: false,
      oversellStatus: "fulfilled",
      orderStatus: "pending",
      status: "Pending",
      oversellResolvedAt: now,
      restockEtaLabel: undefined,
    } as any);
    if (order.email) {
      await insertCustomerNotification(db, {
        email: String(order.email),
        type: "oversell_fulfilled",
        title: "Your reserved item is ready",
        body: `Good news! Stock for order ${order.orderId} is now available. We’re preparing your order.`,
        url: `/track-order?orderId=${encodeURIComponent(String(order.orderId))}`,
        orderId: String(order.orderId),
      });
    }
    fulfilled += 1;
  }
  return { fulfilled };
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
              needsOversellChoice: !!paid?.needsOversellChoice,
              oversellStatus: paid?.oversellStatus || "",
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
      && !(deductResult as any)?.needsOversellChoice
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
      needsOversellChoice:
        !!(deductResult as any)?.needsOversellChoice
        || String((latest as any)?.oversellStatus || "") === "choice_needed",
      oversellStatus: String((latest as any)?.oversellStatus || ""),
      restockEtaLabel: String((latest as any)?.restockEtaLabel || RESTOCK_ETA_LABEL),
    };
  },
});

/** Customer: keep paid order and wait for next restock (locked claim). */
export const chooseOversellReserve = mutation({
  args: { orderId: v.string(), email: v.optional(v.string()) },
  handler: async ({ db }, { orderId, email }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, message: "Order not found." };
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      return { success: false, message: "Order is not paid." };
    }
    if (String((order as any).oversellStatus || "") !== "choice_needed") {
      return {
        success: false,
        message: "This order is not waiting for an oversell choice.",
      };
    }
    const emailNorm = String(email || "").trim().toLowerCase();
    if (
      emailNorm
      && String(order.email || "").trim().toLowerCase() !== emailNorm
    ) {
      return { success: false, message: "Email does not match this order." };
    }
    const now = new Date().toISOString();
    await db.patch(order._id, {
      oversellStatus: "reserved",
      orderStatus: "awaiting_restock",
      status: "Reserved — Awaiting Restock",
      reservedAt: now,
      restockEtaLabel: RESTOCK_ETA_LABEL,
    } as any);
    if (order.email) {
      await insertCustomerNotification(db, {
        email: String(order.email),
        type: "oversell_reserved",
        title: "Item reserved for you",
        body: `Order ${order.orderId} is reserved. Next stock is expected in about ${RESTOCK_ETA_LABEL}. You’re first in line when it arrives.`,
        url: `/track-order?orderId=${encodeURIComponent(String(order.orderId))}`,
        orderId: String(order.orderId),
      });
    }
    return { success: true, restockEtaLabel: RESTOCK_ETA_LABEL };
  },
});

/** Customer: auto-refund PayMongo payment after oversell. */
export const chooseOversellRefund = action({
  args: { orderId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, { orderId, email }) => {
    const order = await ctx.runQuery(api.orders.getOrderById, { orderId });
    if (!order) return { success: false, message: "Order not found." };
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      return { success: false, message: "Order is not paid." };
    }
    if (String((order as any).oversellStatus || "") !== "choice_needed") {
      return {
        success: false,
        message: "This order is not waiting for an oversell choice.",
      };
    }
    const emailNorm = String(email || "").trim().toLowerCase();
    if (
      emailNorm
      && String(order.email || "").trim().toLowerCase() !== emailNorm
    ) {
      return { success: false, message: "Email does not match this order." };
    }

    await ctx.runMutation(api.payments.setOversellRefundPending, { orderId });

    const amount = Number(order.finalTotal ?? order.total ?? 0);
    const refund = await refundPaymongoPayment(
      order,
      amount,
      `Oversell auto-refund for ${orderId}`
    );

    if (!refund.refunded) {
      // Allow customer to retry choice / admin to finish manually
      await ctx.runMutation(api.payments.revertOversellRefundPending, { orderId });
      return {
        success: false,
        message: refund.error || "Refund failed. Please contact support or try again.",
        refundPending: false,
      };
    }

    await ctx.runMutation(api.payments.finalizeOversellRefund, {
      orderId,
      refundId: refund.refundId || "",
    });
    return { success: true, refunded: true, refundId: refund.refundId };
  },
});

export const setOversellRefundPending = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    await db.patch(order._id, {
      oversellStatus: "refund_pending",
      refundStatus: "requested",
      refundReason: "Oversell — customer chose refund",
      refundRequestedAt: new Date().toISOString(),
      refundAmount: Number(order.finalTotal ?? order.total ?? 0),
    } as any);
    return { success: true };
  },
});

export const revertOversellRefundPending = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    if (String((order as any).oversellStatus || "") !== "refund_pending") {
      return { success: false };
    }
    await db.patch(order._id, {
      oversellStatus: "choice_needed",
      orderStatus: "awaiting_restock_choice",
      status: "Awaiting Restock Choice",
      refundStatus: undefined,
      refundReason: undefined,
      refundRequestedAt: undefined,
      refundAmount: undefined,
      restockEtaLabel: RESTOCK_ETA_LABEL,
    } as any);
    return { success: true };
  },
});

export const finalizeOversellRefund = mutation({
  args: { orderId: v.string(), refundId: v.optional(v.string()) },
  handler: async ({ db }, { orderId, refundId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    const now = new Date().toISOString();
    await db.patch(order._id, {
      oversellStatus: "refunded",
      orderStatus: "cancelled",
      status: "Cancelled",
      paymentStatus: "refunded",
      cancelledAt: now,
      cancelledBy: "system",
      cancelReason: "Oversell — automatic refund",
      refundStatus: "approved",
      refundResolvedAt: now,
      refundPaidAt: now,
      paymongoRefundId: refundId || (order as any).paymongoRefundId,
      oversellResolvedAt: now,
      restockEtaLabel: undefined,
    } as any);
    if (order.email) {
      await insertCustomerNotification(db, {
        email: String(order.email),
        type: "oversell_refunded",
        title: "Refund sent",
        body: `Your payment for order ${order.orderId} was refunded because the item sold out. Funds return via GCash/Maya (usually 1–3 business days).`,
        url: `/track-order?orderId=${encodeURIComponent(String(order.orderId))}`,
        orderId: String(order.orderId),
      });
    }
    return { success: true };
  },
});

/** Admin: try to fulfill reserved oversell orders from current stock. */
export const fulfillReservedOrders = mutation({
  args: { productId: v.optional(v.string()) },
  handler: async ({ db }, { productId }) => {
    return await tryFulfillReservedOrders(db, productId);
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

    if (!isDamageRefund && !isPaidPending) {
      return { success: false, error: "No pending refund / Return Payment for this order." };
    }

    const amount = Number(order.finalTotal ?? order.total ?? order.refundAmount ?? 0);
    if (!(amount > 0)) return { success: false, error: "Invalid refund amount." };

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
        refundAmount: Number(order.finalTotal ?? order.total ?? 0),
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

    const amount = Number(order.finalTotal ?? order.total ?? order.refundAmount ?? 0);
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