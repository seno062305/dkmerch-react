// convex/orders.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  allocateOrderSeq,
  buildOrderId,
  ensureOrderCounterSeeded,
  repairDuplicateOrderSeqs,
  resetOrderCounter,
} from "./lib/orderSeq";
import { insertCustomerNotification } from "./customerNotifications";
import { deductStockForPaidOrder, findProductForOrderItem } from "./payments";

function shortOrderId(orderId: string): string {
  return String(orderId || "").slice(-8).toUpperCase();
}

async function notifyCustomerInApp(
  db: any,
  args: {
    email?: string | null;
    type: string;
    title: string;
    body: string;
    url?: string;
    orderId?: string;
  }
) {
  if (!args.email) return;
  await insertCustomerNotification(db, {
    email: args.email,
    type: args.type,
    title: args.title,
    body: args.body,
    url: args.url,
    orderId: args.orderId,
  });
}

export const getAllOrders = query(async ({ db }) => {
  // Newest orders first system-wide
  return await db.query("orders").order("desc").collect();
});

export const getOrdersByUser = query({
  args: { userEmail: v.string() },
  handler: async ({ db }, { userEmail }) => {
    return await db.query("orders")
      .withIndex("by_email", q => q.eq("email", userEmail))
      .order("desc")
      .collect();
  },
});

export const getOrdersByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db.query("orders")
      .withIndex("by_email", q => q.eq("email", email))
      .order("desc")
      .collect();
  },
});

export const getOrderById = query({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    return await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
  },
});

export const createOrder = mutation({
  args: {
    /** Optional — ignored for live checkout; server allocates under lock. Kept for failover sync-back. */
    orderId: v.optional(v.string()),
    email: v.string(),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    items: v.array(v.object({
      id: v.string(),
      name: v.string(),
      price: v.number(),
      image: v.string(),
      quantity: v.number(),
      category: v.optional(v.string()),
      isPreOrder: v.optional(v.boolean()),
      releaseDate: v.optional(v.union(v.string(), v.null())),
    })),
    total: v.number(),
    subtotal: v.optional(v.number()),
    shippingFee: v.optional(v.number()),
    promoCode:       v.optional(v.string()),
    promoName:       v.optional(v.string()),
    discountAmount:  v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    finalTotal:      v.optional(v.number()),
    paymentFee:      v.optional(v.number()),
    paymentFeeRate:  v.optional(v.number()),
    paymentFeeMethod: v.optional(v.string()),
    status: v.string(),
    orderStatus: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    addressLat: v.optional(v.number()),
    addressLng: v.optional(v.number()),
    deliveryMethod: v.optional(v.string()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
    isRewardOrder: v.optional(v.boolean()),
    rewardTicketCode: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    // If client sent a failover/provisional id that already exists, don't mint a duplicate row
    const clientId = String(args.orderId || "").trim();
    if (clientId) {
      const existing = await db
        .query("orders")
        .withIndex("by_orderId", (q) => q.eq("orderId", clientId))
        .first();
      if (existing) {
        return { success: true, orderId: existing.orderId, orderSeq: existing.orderSeq, duplicate: true };
      }
    }

    // Make sure counter doc exists so concurrent checkouts OCC-serialize (not all get the same #)
    await ensureOrderCounterSeeded(db);
    const orderSeq = await allocateOrderSeq(db);
    const orderId = buildOrderId(orderSeq);
    const { orderId: _ignored, ...rest } = args;
    await db.insert("orders", { ...rest, orderId, orderSeq });
    return { success: true, orderId, orderSeq };
  },
});

/**
 * Admin Manual Record — in-store / walk-in sale.
 * Uses current product prices, marks paid + completed, and deducts stock once.
 */
export const createWalkInOrder = mutation({
  args: {
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        id: v.string(),
        quantity: v.number(),
      })
    ),
  },
  handler: async ({ db }, args) => {
    const lines = Array.isArray(args.items) ? args.items : [];
    if (!lines.length) throw new Error("Add at least one product.");

    const built: {
      id: string;
      name: string;
      price: number;
      image: string;
      quantity: number;
      category?: string;
      isPreOrder?: boolean;
      releaseDate?: string | null;
    }[] = [];
    const shortages: string[] = [];

    for (const line of lines) {
      const qty = Math.floor(Number(line.quantity) || 0);
      if (qty <= 0) throw new Error("Quantity must be at least 1.");
      const product = await findProductForOrderItem(db, { id: line.id });
      if (!product) throw new Error(`Product not found: ${line.id}`);
      const stock = Number((product as any).stock);
      if (Number.isFinite(stock) && stock < qty) {
        shortages.push(
          `${(product as any).name || "Item"} (need ${qty}, left ${Math.max(0, stock)})`
        );
        continue;
      }
      built.push({
        id: String((product as any)._id),
        name: String((product as any).name || "Item"),
        price: Number((product as any).price) || 0,
        image: String((product as any).image || ""),
        quantity: qty,
        category: (product as any).category
          ? String((product as any).category)
          : undefined,
        isPreOrder: !!(product as any).isPreOrder,
        releaseDate: (product as any).releaseDate ?? null,
      });
    }

    if (shortages.length) {
      throw new Error(`Out of stock: ${shortages.join("; ")}`);
    }
    if (!built.length) throw new Error("Add at least one product.");

    const subtotal = built.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const now = new Date().toISOString();
    const rawPay = String(args.paymentMethod || "cash").trim().toLowerCase();
    const paymentMethod =
      rawPay === "gcash" || rawPay.includes("gcash")
        ? "gcash"
        : rawPay === "maya" || rawPay.includes("maya") || rawPay.includes("paymaya")
          ? "maya"
          : "cash";
    const customerName =
      String(args.customerName || "").trim() || "Walk-in Customer";
    const email =
      String(args.email || "").trim() || "walkin@dkmerch.local";
    const phone = String(args.phone || "").trim() || undefined;
    const notes = String(args.notes || "").trim() || undefined;

    await ensureOrderCounterSeeded(db);
    const orderSeq = await allocateOrderSeq(db);
    const orderId = buildOrderId(orderSeq);

    const docId = await db.insert("orders", {
      orderId,
      orderSeq,
      email,
      customerName,
      phone,
      items: built,
      total: subtotal,
      subtotal,
      shippingFee: 0,
      finalTotal: subtotal,
      status: "Completed",
      orderStatus: "completed",
      deliveryMethod: "store",
      shippingAddress: "In-store / Walk-in",
      paymentMethod,
      paymentStatus: "paid",
      paidAt: now,
      deliveryConfirmedAt: now,
      ...(notes ? { notes } : {}),
      isWalkIn: true,
      paymentReceivedEmailSent: true, // no customer email for walk-in placeholder
    });

    const order = await db.get(docId);
    await deductStockForPaidOrder(db, order);

    return { success: true, orderId, orderSeq, total: subtotal };
  },
});

/** One-shot: renumber display # by creation time + align counter (after clear / duplicates). */
export const repairOrderNumbers = mutation({
  args: {},
  handler: async ({ db }) => {
    const repaired = await repairDuplicateOrderSeqs(db);
    // Align counter from orderSeq only (not old DK-00xx strings that kept next # at 34+).
    const counter = await resetOrderCounter(db);
    return { ...repaired, nextSeq: counter.nextSeq };
  },
});

export const ensureOrderCounter = mutation({
  args: {},
  handler: async ({ db }) => ensureOrderCounterSeeded(db),
});

/** Used by failover sync-back (Firebase → Convex). Dedupes on orderId. */
export const upsertOrderFromFailover = internalMutation({
  args: { order: v.any() },
  handler: async (ctx, { order }) => {
    const orderId = String(order?.orderId || "").trim();
    if (!orderId) return { inserted: false, reason: "missing_orderId" };

    const existing = await ctx.db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (existing) {
      return { inserted: false, reason: "duplicate", convexId: existing._id };
    }

    const items = Array.isArray(order.items)
      ? order.items.map((it: any) => ({
          id: String(it?.id || ""),
          name: String(it?.name || "Item"),
          price: Number(it?.price) || 0,
          image: String(it?.image || ""),
          quantity: Number(it?.quantity) || 1,
          isPreOrder: !!it?.isPreOrder,
          releaseDate: it?.releaseDate ?? null,
        }))
      : [];

    const convexId = await ctx.db.insert("orders", {
      orderId,
      email: String(order.email || ""),
      customerName: order.customerName ? String(order.customerName) : undefined,
      phone: order.phone ? String(order.phone) : undefined,
      items,
      total: Number(order.total) || 0,
      subtotal: order.subtotal != null ? Number(order.subtotal) : undefined,
      shippingFee: order.shippingFee != null ? Number(order.shippingFee) : undefined,
      promoCode: order.promoCode ? String(order.promoCode) : undefined,
      promoName: order.promoName ? String(order.promoName) : undefined,
      discountAmount: order.discountAmount != null ? Number(order.discountAmount) : undefined,
      discountPercent: order.discountPercent != null ? Number(order.discountPercent) : undefined,
      finalTotal: order.finalTotal != null ? Number(order.finalTotal) : undefined,
      status: String(order.status || "Pending Payment"),
      orderStatus: String(order.orderStatus || "pending"),
      shippingAddress: order.shippingAddress ? String(order.shippingAddress) : undefined,
      addressLat: order.addressLat != null ? Number(order.addressLat) : undefined,
      addressLng: order.addressLng != null ? Number(order.addressLng) : undefined,
      deliveryMethod: order.deliveryMethod ? String(order.deliveryMethod) : undefined,
      paymentMethod: String(order.paymentMethod || "paymongo"),
      notes: order.notes ? String(order.notes) : undefined,
      paymentStatus: String(order.paymentStatus || "pending"),
      paymentLinkId: order.paymentLinkId ? String(order.paymentLinkId) : undefined,
      paymentLinkUrl: order.paymentLinkUrl ? String(order.paymentLinkUrl) : undefined,
      isRewardOrder: order.isRewardOrder ? true : undefined,
      rewardTicketCode: order.rewardTicketCode ? String(order.rewardTicketCode) : undefined,
    } as any);

    await ctx.db.insert("activityLogs", {
      action: "failover_order_synced",
      actorRole: "system",
      details: `Synced failover order ${orderId} from Firebase → Convex`,
      createdAt: Date.now(),
    });

    return { inserted: true, convexId };
  },
});

// ─── SHARED HELPER ────────────────────────────────────────────────────────────
const RIDER_MAX_KM = 40;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** LBC only when far from store (or explicit lbc without nearby coords). */
async function isLbcDelivery(db: any, order: any): Promise<boolean> {
  if (!order) return false;
  if (order.deliveryMethod === 'rider') return false;

  const settings = await db.query("settings").first();
  const storeLat = Number(settings?.storeLat);
  const storeLng = Number(settings?.storeLng);
  const lat = Number(order.addressLat);
  const lng = Number(order.addressLng);

  if (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Number.isFinite(storeLat) && Number.isFinite(storeLng)
  ) {
    return haversineKm(storeLat, storeLng, lat, lng) > RIDER_MAX_KM;
  }

  return order.deliveryMethod === 'lbc';
}

async function onOrderConfirmed(
  scheduler: any,
  db: any,
  order: any,
  orderId: string,
) {
  const customerName = order.customerName || 'Customer';
  const total = (order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
  });
  const itemCount      = order.items?.length || 0;
  const shippingAddr   = order.shippingAddress || 'N/A';
  const now            = new Date().toISOString();
  const isLbc          = await isLbcDelivery(db, order);

  if (order.email) {
    await scheduler.runAfter(0, internal.sendEmail.sendOrderConfirmedEmail, {
      to:              order.email,
      customerName,
      orderId,
      total,
      itemCount,
      shippingAddress: shippingAddr,
    });
    // Phone push (installed PWA) — fire on every confirm
    await scheduler.runAfter(0, internal.webPush.sendToEmail, {
      email: order.email,
      title: "Order confirmed ✅",
      body: `Hi ${customerName}! Your order #${orderId.slice(-8).toUpperCase()} was confirmed.`,
      url: `/track-order?order=${encodeURIComponent(orderId)}`,
    });
    await notifyCustomerInApp(db, {
      email: order.email,
      type: "order_confirmed",
      title: "Order confirmed ✅",
      body: `Your order #${shortOrderId(orderId)} was confirmed by admin.`,
      url: `/track-order?order=${encodeURIComponent(orderId)}`,
      orderId,
    });
  }

  // Always send order-details summary to customer chat on confirm
  await scheduler.runAfter(0, internal.supportChat.sendOrderConfirmedChat, {
    orderId,
    isLbc,
  });

  // Outside NCR → LBC Express only — do not notify motorcycle riders
  if (isLbc) return;

  await scheduler.runAfter(0, internal.sendEmail.sendRiderNewOrderEmail, {
    orderId,
    customerName,
    total,
    itemCount,
    shippingAddress: shippingAddr,
  });

  await db.insert("riderNotifications", {
    type:         "new_order",
    orderId,
    customerName,
    total:        order.finalTotal ?? order.total ?? 0,
    createdAt:    now,
    read:         false,
  });
}

export const updateOrderStatus = mutation({
  args: {
    orderId:     v.string(),
    status:      v.string(),
    orderStatus: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderId, status, orderStatus }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    // Paid cancels must go through payments.adminCancelOrder / cancel-request flow
    // (auto-refund). Exception: never via this status-only mutation.
    if (
      String(orderStatus || "").toLowerCase() === "cancelled"
      && String(order.paymentStatus || "").toLowerCase() === "paid"
    ) {
      return {
        success: false,
        message: "Paid orders cannot be cancelled here. Use Cancel Order (pending) or the cancel-request refund flow.",
      };
    }

    const now     = new Date().toISOString();
    const updates: any = { status };
    if (orderStatus !== undefined) updates.orderStatus = orderStatus;

    if (orderStatus === 'confirmed')        updates.confirmedAt         = now;
    if (orderStatus === 'shipped')          updates.shippedAt           = now;
    if (orderStatus === 'out_for_delivery') updates.outForDeliveryAt    = now;
    if (orderStatus === 'completed')        updates.deliveryConfirmedAt = now;
    if (orderStatus === 'cancelled')        updates.cancelledAt         = now;

    await db.patch(order._id, updates);

    if (orderStatus === 'confirmed') {
      await onOrderConfirmed(scheduler, db, order, orderId);
    } else if (orderStatus && order.email) {
      // Notify customer on every admin progress step (shipped / completed / cancelled / etc.)
      const label = String(orderStatus).replace(/_/g, " ");
      const note = orderStatus === "cancelled" ? (order.cancelReason || undefined) : undefined;
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId,
        orderStatus,
        actorLabel: "Admin",
        note,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Order update · #${shortOrderId(orderId)}`,
        body: note ? `Status: ${label}. Reason: ${note}` : `Status: ${label}`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: order.email,
        type: orderStatus === "cancelled" ? "order_cancelled" : "order_update",
        title: `Order ${label} · #${shortOrderId(orderId)}`,
        body: note
          ? `Admin updated your order to ${label}. Reason: ${note}`
          : `Admin updated your order to ${label}.`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
        orderId,
      });
    }

    return { success: true };
  },
});

/**
 * Admin marks a confirmed LBC order as shipped (with photo → customer chat).
 * Moves the order to the Shipped tab; Confirm Deliver unlocks after this.
 */
export const markLbcShipped = mutation({
  args: {
    orderId: v.string(),
    /** Shipping proof image (data URL) */
    photo: v.string(),
    /** Optional Convex storage id so the same photo is sent in customer chat */
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async ({ db, scheduler }, { orderId, photo, imageStorageId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, message: "Order not found." };

    if (!(await isLbcDelivery(db, order))) {
      return { success: false, message: "This order is not an LBC shipment." };
    }
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      return { success: false, message: "Order must be paid before marking as shipped." };
    }

    const status = String(order.orderStatus || "").toLowerCase();
    if (status === "cancelled") {
      return { success: false, message: "Canceled orders cannot be shipped." };
    }
    if (status === "completed") {
      return { success: false, message: "Order is already delivered." };
    }
    if (status === "pending") {
      return { success: false, message: "Confirm the order first, then mark it as shipped." };
    }
    if (status === "shipped" || status === "out_for_delivery") {
      return { success: true, alreadyShipped: true };
    }
    if (status !== "confirmed") {
      return { success: false, message: "Only processing (confirmed) LBC orders can be marked shipped." };
    }

    const proof = String(photo || "").trim();
    if (!proof) {
      return { success: false, message: "Upload a shipping photo before marking as shipped." };
    }
    if (proof.length > 900_000) {
      return { success: false, message: "Photo is too large. Please use a smaller image." };
    }

    const now = new Date().toISOString();
    await db.patch(order._id, {
      deliveryMethod: "lbc",
      orderStatus: "shipped",
      status: "Shipped",
      shippedAt: now,
      lbcShippedPhoto: proof,
      ...(imageStorageId ? { lbcShippedPhotoId: imageStorageId } : {}),
    } as any);

    await scheduler.runAfter(0, internal.supportChat.sendOrderShippedChat, {
      orderId,
      imageStorageId: imageStorageId || undefined,
      isLbc: true,
    });

    if (order.email) {
      await notifyCustomerInApp(db, {
        email: order.email,
        type: "order_update",
        title: `Shipped via LBC · #${shortOrderId(orderId)}`,
        body: "Your order was marked shipped. Check chat for the shipping photo.",
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
        orderId,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Shipped via LBC · #${shortOrderId(orderId)}`,
        body: "Your order is on the way via LBC Express.",
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId,
        orderStatus: "shipped",
        actorLabel: "Admin",
        note: "Shipped via LBC Express. Shipping proof was sent to your chat.",
      });
    }

    return { success: true };
  },
});

/**
 * Admin confirms LBC delivery with required proof photo.
 * Marks order Delivered and shows proof on the customer Track Order page.
 */
export const approveLbcDelivery = mutation({
  args: {
    orderId: v.string(),
    /** Required proof image (data URL) that LBC delivered the parcel */
    photo: v.string(),
  },
  handler: async ({ db, scheduler }, { orderId, photo }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, message: "Order not found." };

    const status = String(order.orderStatus || "").toLowerCase();
    if (status === "cancelled") {
      return { success: false, message: "Canceled orders cannot be approved." };
    }
    if (status === "completed" && (order as any).deliveryProofPhoto) {
      return { success: true, alreadyApproved: true };
    }
    if (String(order.paymentStatus || "").toLowerCase() !== "paid") {
      return { success: false, message: "Order must be paid before confirming LBC delivery." };
    }
    if (status === "pending" || status === "confirmed") {
      return {
        success: false,
        message: "Mark the LBC order as Shipped first (with photo), then Confirm Deliver.",
      };
    }
    if (status !== "shipped" && status !== "out_for_delivery") {
      return {
        success: false,
        message: "Only shipped LBC orders can be marked delivered.",
      };
    }

    const proof = String(photo || "").trim();
    if (!proof) {
      return { success: false, message: "Upload LBC delivery proof photo before approving." };
    }
    if (proof.length > 900_000) {
      return { success: false, message: "Photo is too large. Please use a smaller image." };
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      deliveryMethod: "lbc",
      lbcAcceptedAt: now,
      deliveryProofPhoto: proof,
      deliveryConfirmedAt: now,
      orderStatus: "completed",
      status: "Delivered",
    };
    if (!order.confirmedAt) {
      patch.confirmedAt = now;
    }
    if (!order.shippedAt) {
      patch.shippedAt = now;
    }
    await db.patch(order._id, patch as any);

    if (order.email) {
      await notifyCustomerInApp(db, {
        email: order.email,
        type: "order_delivered",
        title: `Delivered via LBC · #${shortOrderId(orderId)}`,
        body: "Your order was delivered by LBC Express. View the delivery proof on Track Order.",
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
        orderId,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Delivered via LBC · #${shortOrderId(orderId)}`,
        body: "Your order was delivered by LBC Express. Open Track Order to view proof.",
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId,
        orderStatus: "completed",
        actorLabel: "Admin",
        note: "Delivered via LBC Express. Delivery proof is available on Track Order.",
      });
    }

    return { success: true };
  },
});

export const updateOrderFields = mutation({
  args: {
    orderId:             v.string(),
    status:              v.optional(v.string()),
    orderStatus:         v.optional(v.string()),
    riderId:             v.optional(v.string()),
    riderInfo:           v.optional(v.any()),
    riderGpsLink:        v.optional(v.string()),
    deliveryOtp:         v.optional(v.string()),
    deliveryOtpVerified: v.optional(v.boolean()),
    deliveryProofPhoto:  v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelReason:        v.optional(v.string()),
    shippingAddress:     v.optional(v.string()),
    addressLat:          v.optional(v.number()),
    addressLng:          v.optional(v.number()),
    deliveryMethod:      v.optional(v.string()),
    notes:               v.optional(v.string()),
    paymentStatus:       v.optional(v.string()),
    paymentLinkId:       v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderId, ...updates }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const now     = new Date().toISOString();
    const filtered: any = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    // Paid cancels need refund handling — use payments.adminCancelOrder (pending)
    // or approveCustomerCancel (cancel-request flow).
    if (
      String(filtered.orderStatus || "").toLowerCase() === "cancelled"
      && String(order.paymentStatus || "").toLowerCase() === "paid"
    ) {
      return {
        success: false,
        message: "Paid orders cannot be cancelled here. Use Cancel Order (before confirm) or the cancel-request refund flow.",
      };
    }

    if (filtered.orderStatus === 'confirmed')        filtered.confirmedAt      = now;
    if (filtered.orderStatus === 'shipped')          filtered.shippedAt        = now;
    if (filtered.orderStatus === 'out_for_delivery') filtered.outForDeliveryAt = now;
    if (filtered.orderStatus === 'completed' || filtered.deliveryOtpVerified)
      filtered.deliveryConfirmedAt = filtered.deliveryConfirmedAt || now;
    if (filtered.orderStatus === 'cancelled') filtered.cancelledAt = now;

    if (filtered.orderStatus === 'confirmed') {
      await onOrderConfirmed(scheduler, db, order, orderId);
    } else if (filtered.orderStatus && order.email) {
      const isRiderStep =
        filtered.orderStatus === 'out_for_delivery' || filtered.orderStatus === 'completed';
      const hasRider = !!(filtered.riderInfo?.name || order.riderInfo?.name);
      const actorLabel = isRiderStep && hasRider ? 'Rider' : 'Admin';
      const label = String(filtered.orderStatus).replace(/_/g, ' ');
      const note =
        filtered.orderStatus === 'cancelled'
          ? (filtered.cancelReason || order.cancelReason || undefined)
          : undefined;
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || 'Customer',
        orderId,
        orderStatus: filtered.orderStatus,
        actorLabel,
        note,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Order update · #${shortOrderId(orderId)}`,
        body: note ? `${actorLabel}: ${label}. Reason: ${note}` : `${actorLabel}: ${label}`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: order.email,
        type:
          filtered.orderStatus === 'cancelled'
            ? 'order_cancelled'
            : filtered.orderStatus === 'out_for_delivery'
              ? 'out_for_delivery'
              : 'order_update',
        title: `Order ${label} · #${shortOrderId(orderId)}`,
        body: note
          ? `${actorLabel} updated your order to ${label}. Reason: ${note}`
          : `${actorLabel} updated your order to ${label}.`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
        orderId,
      });
    }

    // Delivery verified → notify customer they can claim loyalty points
    const becameDelivered =
      (filtered.orderStatus === 'completed' || filtered.deliveryOtpVerified === true) &&
      !order.pointsAwarded &&
      !order.isRewardOrder &&
      !!order.email;
    if (becameDelivered) {
      const orderTotal = Number(order.finalTotal ?? order.total ?? 0);
      let pts = 5;
      if (orderTotal >= 5000) pts = 25;
      else if (orderTotal >= 3000) pts = 20;
      else if (orderTotal >= 2000) pts = 15;
      else if (orderTotal >= 1000) pts = 10;
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `You earned ${pts} pts! ⭐`,
        body: `Order #${orderId.slice(-8).toUpperCase()} delivered — open DKMerch to claim your points.`,
        url: `/?claimPoints=${encodeURIComponent(orderId)}`,
      });
    }

    await db.patch(order._id, filtered);
    return { success: true };
  },
});

export const updateOrderOtp = mutation({
  args: { orderId: v.string(), deliveryOtp: v.string() },
  handler: async ({ db }, { orderId, deliveryOtp }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    await db.patch(order._id, { deliveryOtp });
    return { success: true };
  },
});

const FAILED_ATTEMPT_MAX = 3;
const FAILED_ATTEMPT_REASONS: Record<string, string> = {
  customer_no_show: "Customer did not show up / was not at the address",
  cannot_be_reached: "Cannot be reached",
  /** legacy code from earlier builds */
  no_answer: "Cannot be reached",
};

/** Rider reports unsuccessful delivery handoff (max 3). 3rd attempt → Failed Delivery completed. */
export const reportFailedDeliveryAttempt = mutation({
  args: {
    orderId: v.string(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    reasonCode: v.optional(v.string()),
    reason: v.optional(v.string()),
    riderName: v.optional(v.string()),
    /** City-level last-seen place (preferred over raw coords in notices) */
    address: v.optional(v.string()),
    /** Rider phone/browser label (e.g. Chrome on Infinix) */
    deviceLabel: v.optional(v.string()),
    /** Optional photo proof (data URL / base64) */
    photo: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
    if (!order) return { success: false, message: "Order not found." };

    const status = String(order.orderStatus || "").toLowerCase();
    if (status !== "out_for_delivery") {
      return { success: false, message: "Order must be out for delivery." };
    }
    if (order.deliveryOtpVerified || (order as any).deliveryFailedFinal) {
      return { success: false, message: "Order already closed." };
    }

    const existing: any[] = Array.isArray(order.deliveryFailedAttempts)
      ? [...order.deliveryFailedAttempts]
      : [];
    if (existing.length >= FAILED_ATTEMPT_MAX) {
      return { success: false, message: "Maximum of 3 failed attempts reached." };
    }

    const attempt = existing.length + 1;
    let reasonCode = args.reasonCode ? String(args.reasonCode).trim() : "";
    let reason = args.reason ? String(args.reason).trim() : "";

    // Every attempt (1–3) requires a rider reason
    if (!reasonCode && !reason) {
      return {
        success: false,
        message: "Select a reason for this failed attempt.",
        requiresReason: true,
      };
    }
    if (reasonCode === "other") {
      reason = reason.slice(0, 280);
      if (!reason) {
        return {
          success: false,
          message: "Type the other reason for this failed attempt.",
          requiresReason: true,
        };
      }
    } else if (reasonCode && FAILED_ATTEMPT_REASONS[reasonCode]) {
      reason = FAILED_ATTEMPT_REASONS[reasonCode];
    }
    if (!reason) {
      return { success: false, message: "Select a valid reason for this failed attempt." };
    }

    const photoRaw = args.photo ? String(args.photo) : "";
    if (photoRaw && photoRaw.length > 900_000) {
      return { success: false, message: "Photo is too large. Please use a smaller image." };
    }
    const photo = photoRaw || "";

    const timelineMsg =
      `Delivery attempt was unsuccessful : Recipient Request Reschedule Delivery — Reason: ${reason}`;

    const lat = Number(args.lat);
    const lng = Number(args.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { success: false, message: "GPS location is required as proof." };
    }

    const at = new Date().toISOString();
    const riderName = String(args.riderName || order.riderInfo?.name || "Rider").trim() || "Rider";
    const address = String(args.address || "").trim();
    const deviceLabel = String(args.deviceLabel || "").trim();
    const entry = {
      attempt,
      ...(reason ? { reason } : {}),
      ...(reasonCode ? { reasonCode } : {}),
      lat,
      lng,
      ...(args.accuracy != null && Number.isFinite(Number(args.accuracy))
        ? { accuracy: Number(args.accuracy) }
        : {}),
      ...(address ? { address } : {}),
      ...(deviceLabel ? { deviceLabel } : {}),
      ...(photo ? { photo } : {}),
      riderName,
      at,
    };
    existing.push(entry);

    const isFinalFail = existing.length >= FAILED_ATTEMPT_MAX;
    const patch: Record<string, unknown> = {
      deliveryFailedAttempts: existing,
      deliveryFailedAttemptCount: existing.length,
    };
    if (isFinalFail) {
      patch.orderStatus = "completed";
      patch.status = "Failed Delivery";
      patch.deliveryFailedFinal = true;
      patch.deliveryConfirmedAt = at;
    }
    await db.patch(order._id, patch as any);

    if (isFinalFail) {
      const pickups = await db.query("pickupRequests").collect();
      for (const p of pickups) {
        if (
          String(p.orderId) === String(args.orderId)
          && ["approved", "out_for_delivery", "scanned", "pending"].includes(String(p.status || ""))
        ) {
          await db.patch(p._id, { status: "completed" });
        }
      }
      const locs = await db
        .query("riderLocations")
        .withIndex("by_orderId", (q) => q.eq("orderId", String(args.orderId)))
        .collect();
      for (const loc of locs) {
        await db.patch(loc._id, { isTracking: false, updatedAt: Date.now() } as any);
      }
    }

    const shortId = shortOrderId(args.orderId);
    const customer = order.customerName || "Customer";
    // Prefer city last-seen — never bake raw GPS coords into the notice text
    const placeLabel = address || "map pin (tap to view)";
    const attemptLabel = `Attempt ${attempt}/${FAILED_ATTEMPT_MAX}`;
    const devicePart = deviceLabel ? ` · Device: ${deviceLabel}` : "";
    const finalPart = isFinalFail ? " · Order closed as Failed Delivery (3/3)." : "";

    await db.insert("riderNotifications", {
      type: "delivery_failed_attempt",
      orderId: String(args.orderId),
      customerName: String(customer),
      total: Number(order.finalTotal ?? order.total ?? 0),
      message:
        `⚠️ ${riderName} reported failed delivery (${attemptLabel}) for Order #${shortId} · ${customer}. ` +
        `Last seen: ${placeLabel}${devicePart} · ${timelineMsg}${finalPart}`,
      createdAt: at,
      read: false,
      lat,
      lng,
      ...(address ? { address } : {}),
      ...(deviceLabel ? { deviceLabel } : {}),
      attempt,
    });

    if (order.email) {
      const title = isFinalFail
        ? `Failed Delivery · #${shortId}`
        : `Delivery attempt unsuccessful · #${shortId}`;
      const body = isFinalFail
        ? `${timelineMsg} This order is now closed after 3 unsuccessful attempts.`
        : timelineMsg;
      await notifyCustomerInApp(db, {
        email: order.email,
        type: isFinalFail ? "delivery_failed_final" : "delivery_failed_attempt",
        title,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
        orderId: args.orderId,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
      });
    }

    return {
      success: true,
      attempt,
      maxAttempts: FAILED_ATTEMPT_MAX,
      reason: reason || null,
      finalizedFailed: isFinalFail,
    };
  },
});

export const deleteOrder = mutation({
  args: {
    orderId: v.string(),
    reason: v.string(),
  },
  handler: async ({ db, scheduler }, { orderId, reason }) => {
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      return { success: false, message: "A delete reason is required." };
    }
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, message: "Order not found." };

    const customerEmail = String(order.email || "").trim();
    const customerName = order.customerName || "Customer";
    const shortId = shortOrderId(orderId);

    if (customerEmail) {
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: customerEmail,
        customerName,
        orderId,
        orderStatus: "order_deleted",
        actorLabel: "Admin",
        note: trimmedReason,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: customerEmail,
        title: `Order removed · #${shortId}`,
        body: `Admin deleted your order. Reason: ${trimmedReason}`,
        url: "/track-order",
      });
      await notifyCustomerInApp(db, {
        email: customerEmail,
        type: "order_deleted",
        title: `Order deleted · #${shortId}`,
        body: `Admin deleted your order. Reason: ${trimmedReason}`,
        url: "/track-order",
        orderId,
      });
    }

    // Clean related pickup requests for this order
    const pickups = await db
      .query("pickupRequests")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
      .collect();
    await Promise.all(pickups.map((p: any) => db.delete(p._id)));

    await db.delete(order._id);
    return { success: true };
  },
});

export const getServerTime = query({
  handler: async () => {
    return { now: Date.now() };
  },
});

export const updatePaymentSource = mutation({
  args: {
    orderId:       v.string(),
    paymentSource: v.string(),
    paymentStatus: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, paymentSource, paymentStatus }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const updates: any = { paymentSource };
    if (paymentStatus) updates.paymentStatus = paymentStatus;

    await db.patch(order._id, updates);
    return { success: true };
  },
});

// ─── REFUND MUTATIONS ─────────────────────────────────────────────────────────

export const generateRefundUploadUrl = mutation({
  args: {},
  handler: async ({ storage }) => {
    return await storage.generateUploadUrl();
  },
});

export const getRefundPhotoUrl = query({
  args: { storageId: v.string() },
  handler: async ({ storage }, { storageId }) => {
    return await storage.getUrl(storageId);
  },
});

export const requestRefund = mutation({
  args: {
    orderId:             v.string(),
    refundPhotoId:       v.string(),
    refundMethod:        v.union(v.literal('gcash'), v.literal('maya')),
    refundAccountName:   v.string(),
    refundAccountNumber: v.string(),
    refundComment:       v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();

    if (!order) return { success: false, error: 'Order not found.' };

    const status = (order.orderStatus || order.status || '').toLowerCase();
    const isDelivered = status === 'delivered' || status === 'completed';
    if (!isDelivered) return { success: false, error: 'Order is not yet delivered.' };

    const now = new Date().toISOString();

    const newEntry = {
      requestedAt:         now,
      refundPhotoId:       args.refundPhotoId,
      refundMethod:        args.refundMethod,
      refundAccountName:   args.refundAccountName,
      refundAccountNumber: args.refundAccountNumber,
      refundComment:       args.refundComment || '',
      status:              'requested',
      resolvedAt:          null,
      adminNote:           null,
    };

    const existingHistory = (order as any).refundHistory || [];

    await db.patch(order._id, {
      refundStatus:          'requested',
      refundReason:          'damaged',
      refundPhotoId:         args.refundPhotoId,
      refundMethod:          args.refundMethod,
      refundAccountName:     args.refundAccountName,
      refundAccountNumber:   args.refundAccountNumber,
      refundComment:         args.refundComment || '',
      refundRequestedAt:     now,
      refundAdminNote:       undefined,
      refundResolvedAt:      undefined,
      refundPaidAt:          undefined,
      refundAmount:          undefined,
      refundHistory: [...existingHistory, newEntry],
    });

    return { success: true };
  },
});

export const resolveRefund = mutation({
  args: {
    orderId:         v.string(),
    refundStatus:    v.union(v.literal('approved'), v.literal('rejected')),
    refundAdminNote: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderId, refundStatus, refundAdminNote }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const now = new Date().toISOString();
    const refundAmount = (order as any).finalTotal ?? (order as any).total ?? 0;

    const history = ((order as any).refundHistory || []).map((entry: any, idx: number, arr: any[]) => {
      if (idx === arr.length - 1 && entry.status === 'requested') {
        return {
          ...entry,
          status:       refundStatus,
          resolvedAt:   now,
          adminNote:    refundAdminNote || '',
          refundAmount,
        };
      }
      return entry;
    });

    const patchData: any = {
      refundStatus,
      refundAdminNote:  refundAdminNote || '',
      refundResolvedAt: now,
      refundAmount,
      refundHistory:    history,
    };

    if (refundStatus === 'approved') {
      patchData.refundPaidAt = now;
    }

    await db.patch(order._id, patchData);

    const customerEmail = (order as any).email;
    const customerName  = (order as any).customerName || 'Customer';

    if (customerEmail) {
      if (refundStatus === 'approved') {
        await scheduler.runAfter(0, internal.sendEmail.sendRefundApprovedEmail, {
          to:                  customerEmail,
          customerName,
          orderId,
          refundAmount,
          refundMethod:        (order as any).refundMethod || 'gcash',
          refundAccountName:   (order as any).refundAccountName || '',
          refundAccountNumber: (order as any).refundAccountNumber || '',
          adminNote:           refundAdminNote,
        });
      } else {
        await scheduler.runAfter(0, internal.sendEmail.sendRefundRejectedEmail, {
          to:           customerEmail,
          customerName,
          orderId,
          adminNote:    refundAdminNote,
        });
      }
    }

    return { success: true };
  },
});

// ─── NOTIFY CUSTOMER OUT FOR DELIVERY ────────────────────────────────────────

/**
 * Rider taps Notify Customer → mark Out for Delivery, create delivery OTP,
 * email (+ SMS) the customer. Customer shows OTP to rider on arrival.
 */
export const notifyCustomerOutForDelivery = mutation({
  args: {
    orderId:       v.string(),
    riderName:     v.string(),
    riderPhone:    v.string(),
    riderPlate:    v.optional(v.string()),
    riderVehicle:  v.optional(v.string()),
    riderEmail:    v.optional(v.string()),
    riderPhoto:    v.optional(v.union(v.string(), v.null())),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();
    if (!order) throw new Error("Order not found");

    // Reuse OTP if already generated (idempotent re-notify); otherwise create one
    const otp =
      (order as any).deliveryOtp && String((order as any).deliveryOtp).length === 4
        ? String((order as any).deliveryOtp)
        : Math.floor(1000 + Math.random() * 9000).toString();
    const now = new Date().toISOString();

    const riderEmailNorm = String(
      args.riderEmail || (order as any).riderInfo?.email || ""
    )
      .trim()
      .toLowerCase();
    let resolvedPhoto =
      args.riderPhoto || (order as any).riderInfo?.photo || "";
    if (!resolvedPhoto && riderEmailNorm) {
      const app = await db
        .query("riderApplications")
        .withIndex("by_email", (q: any) => q.eq("email", riderEmailNorm))
        .first();
      if (app?.riderPhoto) resolvedPhoto = app.riderPhoto;
      if (!resolvedPhoto) {
        const allApps = await db.query("riderApplications").collect();
        const loose = allApps.find(
          (r: any) => String(r.email || "").trim().toLowerCase() === riderEmailNorm
        );
        if (loose?.riderPhoto) resolvedPhoto = loose.riderPhoto;
      }
    }
    const riderInfo = {
      name: args.riderName,
      phone: args.riderPhone || "",
      vehicle: args.riderVehicle || "motorcycle",
      plate: args.riderPlate || "",
      email: riderEmailNorm,
      photo: resolvedPhoto || "",
    };

    await db.patch(order._id, {
      orderStatus:      "out_for_delivery",
      status:           "Out for Delivery",
      outForDeliveryAt: now,
      deliveryOtp:      otp,
      deliveryOtpVerified: false,
      riderInfo,
    });

    const customerName = order.customerName || "Customer";
    const customerEmail = (args.customerEmail || order.email || "").trim();
    const phone = args.customerPhone || (order as any).phone;

    if (customerEmail) {
      await scheduler.runAfter(0, internal.sendEmail.sendRiderOnTheWayEmail, {
        to:           customerEmail,
        customerName,
        orderId:      order.orderId,
        riderName:    args.riderName,
        riderPhone:   args.riderPhone,
        riderPlate:   args.riderPlate,
        otp,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: customerEmail,
        title: `Out for delivery · #${shortOrderId(order.orderId)}`,
        body: `${args.riderName} is on the way — check Track Order for your OTP.`,
        url: `/track-order?order=${encodeURIComponent(order.orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: customerEmail,
        type: "out_for_delivery",
        title: `Out for delivery · #${shortOrderId(order.orderId)}`,
        body: `${args.riderName} is on the way with your order. Open Track Order for your delivery OTP.`,
        url: `/track-order?order=${encodeURIComponent(order.orderId)}`,
        orderId: order.orderId,
      });
    }

    if (phone) {
      await scheduler.runAfter(0, internal.sendEmail.sendRiderOtpSms, {
        to:      phone,
        name:    customerName,
        orderId: order.orderId,
        otp,
      });
    }

    return { success: true, otp, emailed: !!customerEmail };
  },
});

// ─── CUSTOMER CANCEL (before rider accepts) ───────────────────────────────────

/** Customer may request cancel only before admin confirms the order. */
function isCustomerCancelRequestable(order: any): { ok: boolean; error?: string } {
  if (!order) return { ok: false, error: "Order not found." };
  const status = String(order.orderStatus || order.status || "").toLowerCase();
  if (status === "cancelled") return { ok: false, error: "Order is already cancelled." };
  if (order.cancelRequestStatus === "requested") {
    return { ok: false, error: "Cancel request already submitted — waiting for admin." };
  }
  // Only before admin confirm (pending / Pending Payment)
  if (status && status !== "pending" && status !== "pending payment") {
    return {
      ok: false,
      error: "Order was already confirmed by admin — cancel is no longer available.",
    };
  }
  if (order.riderId || order.riderInfo) {
    return { ok: false, error: "A rider already accepted this order. Contact admin to cancel." };
  }
  return { ok: true };
}

/**
 * Customer requests cancel (before admin confirms). Admin must approve in Orders.
 */
export const requestCustomerCancel = mutation({
  args: {
    orderId: v.string(),
    email: v.string(),
    reason: v.string(),
    phone: v.optional(v.string()),
    refundMethod: v.optional(v.union(v.literal("gcash"), v.literal("maya"))),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
    if (!order) return { success: false, error: "Order not found." };

    const emailNorm = String(args.email || "").trim().toLowerCase();
    const orderEmail = String(order.email || "").trim().toLowerCase();
    if (!emailNorm || emailNorm !== orderEmail) {
      return { success: false, error: "You can only cancel your own orders." };
    }

    const gate = isCustomerCancelRequestable(order);
    if (!gate.ok) return { success: false, error: gate.error };

    const reason = String(args.reason || "").trim();
    if (reason.length < 5) {
      return { success: false, error: "Please explain why you want to cancel (min 5 characters)." };
    }

    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    if (wasPaid) {
      if (!args.refundMethod) return { success: false, error: "Select GCash or Maya (how you paid)." };
      const phone = String(args.phone || "").replace(/\s/g, "");
      if (!/^09\d{9}$/.test(phone)) {
        return { success: false, error: "Enter a valid PH mobile number (09XXXXXXXXX)." };
      }
    }

    const now = new Date().toISOString();
    const amount = Number(order.finalTotal ?? order.total ?? 0);
    await db.patch(order._id, {
      cancelRequestStatus: "requested",
      cancelRequestReason: reason,
      cancelRequestPhone: wasPaid ? String(args.phone || "").replace(/\s/g, "") : undefined,
      cancelRequestMethod: wasPaid ? args.refundMethod : undefined,
      cancelRequestedAt: now,
      cancelRequestNote: undefined,
      cancelResolvedAt: undefined,
    });

    const shortId = String(args.orderId).slice(-8).toUpperCase();
    const customerName = order.customerName || "Customer";

    const admins = await db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();
    const adminEmails = [
      ...new Set(
        admins
          .map((u) => String(u.email || "").trim())
          .filter((e) => e && e.includes("@"))
      ),
    ];
    const adminBody = `${customerName} requested cancel for #${shortId}${wasPaid ? ` (₱${amount.toLocaleString("en-PH")})` : ""}. Reason: ${reason}`;

    for (const adminEmail of adminEmails) {
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: adminEmail,
        title: "Cancel request · review needed",
        body: adminBody,
        url: "/admin",
      });
    }

    await db.insert("riderNotifications", {
      type: "customer_cancel_request",
      orderId: args.orderId,
      customerName,
      total: amount,
      createdAt: now,
      read: false,
      message: adminBody,
    });

    if (order.email) {
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Cancel request sent · #${shortId}`,
        body: "Admin will review your cancel request. We’ll notify you when it’s decided.",
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
      });
    }

    return { success: true };
  },
});

/** Admin rejects a customer cancel request. */
export const rejectCustomerCancel = mutation({
  args: {
    orderId: v.string(),
    adminNote: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderId, adminNote }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, error: "Order not found." };
    if (order.cancelRequestStatus !== "requested") {
      return { success: false, error: "No pending cancel request." };
    }

    const now = new Date().toISOString();
    await db.patch(order._id, {
      cancelRequestStatus: "rejected",
      cancelRequestNote: adminNote || "Cancel request declined by admin",
      cancelResolvedAt: now,
    });

    if (order.email) {
      const body =
        adminNote || "Your cancel request was not approved. The order will continue.";
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Cancel request declined · #${shortOrderId(orderId)}`,
        body,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: order.email,
        type: "cancel_rejected",
        title: `Cancel declined · #${shortOrderId(orderId)}`,
        body,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
        orderId,
      });
    }
    return { success: true };
  },
});

/**
 * Admin cancels an order before confirm (pending only), with optional PayMongo refund info.
 * Once admin confirms, cancel is locked.
 */
export const applyAdminCancel = mutation({
  args: {
    orderId: v.string(),
    reason: v.string(),
    refunded: v.optional(v.boolean()),
    refundId: v.optional(v.string()),
    refundAmount: v.optional(v.number()),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
    if (!order) return { success: false, error: "Order not found." };

    const status = String(order.orderStatus || order.status || "").toLowerCase();
    if (status === "cancelled") {
      return { success: false, error: "Order is already cancelled." };
    }
    if (status === "completed") {
      return { success: false, error: "Completed orders cannot be cancelled." };
    }

    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const isUnconfirmed = !status || status === "pending" || status === "pending payment";
    // Cancel only before admin confirms
    if (!isUnconfirmed) {
      return {
        success: false,
        error: "Order is already confirmed — cancel is no longer allowed.",
      };
    }

    const reason = String(args.reason || "").trim();
    if (reason.length < 3) {
      return { success: false, error: "Cancellation reason is required." };
    }

    const now = new Date().toISOString();
    const amount = Number(args.refundAmount ?? order.finalTotal ?? order.total ?? 0);
    const existingHistory = (order as any).refundHistory || [];
    const patch: any = {
      status: "Cancelled",
      orderStatus: "cancelled",
      cancelledAt: now,
      cancelReason: reason,
      cancelledBy: "admin",
    };

    // Clear / resolve any open customer cancel request
    if (order.cancelRequestStatus === "requested") {
      patch.cancelRequestStatus = "approved";
      patch.cancelRequestNote = "Cancelled directly by admin";
      patch.cancelResolvedAt = now;
    }

    if (wasPaid) {
      patch.refundStatus = "approved";
      patch.refundReason = "admin_cancel";
      patch.refundAmount = amount;
      patch.refundRequestedAt = now;
      patch.refundResolvedAt = now;
      patch.refundPaidAt = now;
      patch.refundAccountName = order.customerName || "";
      patch.refundAdminNote = args.refunded
        ? "Admin cancelled (before confirm) — refunded via PayMongo"
        : "Admin cancelled (before confirm) — refund may need manual follow-up";
      if (args.refundId) patch.paymongoRefundId = args.refundId;
      patch.refundHistory = [
        ...existingHistory,
        {
          requestedAt: now,
          resolvedAt: now,
          status: "approved",
          reason: "admin_cancel",
          refundAmount: amount,
          refundId: args.refundId || "",
          adminNote: reason,
        },
      ];
    }

    if (order.stockDeducted) {
      for (const item of order.items || []) {
        const qty = Number(item.quantity || 1);
        if (!item?.id || qty <= 0) continue;
        try {
          const product = await db.get(item.id as any);
          if (product && typeof (product as any).stock === "number") {
            await db.patch(product._id, {
              stock: Number((product as any).stock) + qty,
            });
          }
        } catch { /* ignore */ }
      }
      patch.stockDeducted = false;
    }

    await db.patch(order._id, patch);

    const shortId = shortOrderId(args.orderId);
    if (order.email) {
      const note = wasPaid
        ? `${reason}. Refund of ₱${amount.toLocaleString("en-PH")} was initiated to your payment method.`
        : reason;
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId: args.orderId,
        orderStatus: "cancelled",
        actorLabel: "Admin",
        note,
      });
      const body = wasPaid
        ? `Admin cancelled your order. Refund ₱${amount.toLocaleString("en-PH")} is on the way.`
        : `Admin cancelled your order. Reason: ${reason}`;
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Order cancelled · #${shortId}`,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: order.email,
        type: "order_cancelled",
        title: `Order cancelled · #${shortId}`,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
        orderId: args.orderId,
      });
    }

    return { success: true, refunded: !!args.refunded, refundAmount: wasPaid ? amount : 0 };
  },
});

/**
 * Finalize cancel after admin approves (and optional PayMongo refund).
 * Called from payments.approveCustomerCancel action.
 */
export const applyCustomerCancel = mutation({
  args: {
    orderId: v.string(),
    refunded: v.optional(v.boolean()),
    refundId: v.optional(v.string()),
    refundAmount: v.optional(v.number()),
    adminNote: v.optional(v.string()),
    proofPhotoId: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();
    if (!order) return { success: false, error: "Order not found." };
    if (order.cancelRequestStatus !== "requested") {
      return { success: false, error: "No pending cancel request." };
    }

    const now = new Date().toISOString();
    const wasPaid = String(order.paymentStatus || "").toLowerCase() === "paid";
    const amount = Number(args.refundAmount ?? order.finalTotal ?? order.total ?? 0);
    const reason = order.cancelRequestReason || "Cancelled by customer (admin approved)";

    // PayMongo auto-refund does not need screenshot proof; manual path still does
    if (wasPaid && !args.proofPhotoId && !args.refunded) {
      return {
        success: false,
        error: "Upload a screenshot proof that the refund was sent before approving.",
      };
    }

    const existingHistory = (order as any).refundHistory || [];
    const patch: any = {
      status: "Cancelled",
      orderStatus: "cancelled",
      cancelledAt: now,
      cancelReason: reason,
      cancelledBy: "customer",
      cancelRequestStatus: "approved",
      cancelRequestNote: args.adminNote || "Approved by admin",
      cancelResolvedAt: now,
    };
    if (args.proofPhotoId) patch.cancelRefundProofId = args.proofPhotoId;

    if (wasPaid) {
      patch.refundStatus = "approved";
      patch.refundReason = "customer_cancel";
      patch.refundAmount = amount;
      patch.refundRequestedAt = order.cancelRequestedAt || now;
      patch.refundResolvedAt = now;
      patch.refundPaidAt = now;
      patch.refundMethod = order.cancelRequestMethod || undefined;
      patch.refundAccountNumber = order.cancelRequestPhone || undefined;
      patch.refundAccountName = order.customerName || "";
      patch.refundAdminNote = args.refunded
        ? "Admin approved cancel — refunded via PayMongo"
        : (args.adminNote || "Admin approved cancel");
      if (args.refundId) patch.paymongoRefundId = args.refundId;
      patch.refundHistory = [
        ...existingHistory,
        {
          requestedAt: order.cancelRequestedAt || now,
          resolvedAt: now,
          status: "approved",
          reason: "customer_cancel",
          refundAmount: amount,
          refundId: args.refundId || "",
          phone: order.cancelRequestPhone || "",
          refundMethod: order.cancelRequestMethod || "",
          adminNote: args.adminNote || "",
          proofPhotoId: args.proofPhotoId || "",
        },
      ];
    }

    // Restore stock only if it was deducted on payment
    if (order.stockDeducted) {
      for (const item of order.items || []) {
        const qty = Number(item.quantity || 1);
        if (!item?.id || qty <= 0) continue;
        try {
          const product = await db.get(item.id as any);
          if (product && typeof (product as any).stock === "number") {
            await db.patch(product._id, {
              stock: Number((product as any).stock) + qty,
            });
          }
        } catch { /* ignore */ }
      }
      (patch as any).stockDeducted = false;
    }

    await db.patch(order._id, patch);

    const shortId = String(args.orderId).slice(-8).toUpperCase();
    if (order.email) {
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId: args.orderId,
        orderStatus: "cancelled",
        actorLabel: "Admin",
        note: wasPaid
          ? `${reason}. Refund of ₱${amount.toLocaleString("en-PH")} was sent to your payment method.`
          : reason,
      });
      const body = wasPaid
        ? `Refund ₱${amount.toLocaleString("en-PH")} is on the way to your wallet.`
        : "Your cancel request was approved. Order cancelled.";
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Cancel approved · #${shortId}`,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
      });
      await notifyCustomerInApp(db, {
        email: order.email,
        type: "cancel_approved",
        title: `Cancel approved · #${shortId}`,
        body,
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
        orderId: args.orderId,
      });
    }

    return { success: true, refunded: !!args.refunded, refundAmount: wasPaid ? amount : 0 };
  },
});