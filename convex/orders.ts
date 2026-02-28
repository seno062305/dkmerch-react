// convex/orders.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getAllOrders = query(async ({ db }) => {
  return await db.query("orders").collect();
});

export const getOrdersByUser = query({
  args: { userEmail: v.string() },
  handler: async ({ db }, { userEmail }) => {
    return await db.query("orders")
      .withIndex("by_email", q => q.eq("email", userEmail))
      .collect();
  },
});

export const getOrdersByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db.query("orders")
      .withIndex("by_email", q => q.eq("email", email))
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
    orderId: v.string(),
    email: v.string(),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    items: v.array(v.object({
      id: v.string(),
      name: v.string(),
      price: v.number(),
      image: v.string(),
      quantity: v.number(),
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
    status: v.string(),
    orderStatus: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    addressLat: v.optional(v.number()),
    addressLng: v.optional(v.number()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    await db.insert("orders", args);
    return { success: true, orderId: args.orderId };
  },
});

// ─── SHARED HELPER ────────────────────────────────────────────────────────────
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

  if (order.email) {
    await scheduler.runAfter(0, internal.sendEmail.sendOrderConfirmedEmail, {
      to:              order.email,
      customerName,
      orderId,
      total,
      itemCount,
      shippingAddress: shippingAddr,
    });
  }

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
    deliveryOtp:         v.optional(v.string()),
    deliveryOtpVerified: v.optional(v.boolean()),
    deliveryProofPhoto:  v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelReason:        v.optional(v.string()),
    shippingAddress:     v.optional(v.string()),
    addressLat:          v.optional(v.number()),
    addressLng:          v.optional(v.number()),
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

    if (filtered.orderStatus === 'confirmed')        filtered.confirmedAt      = now;
    if (filtered.orderStatus === 'shipped')          filtered.shippedAt        = now;
    if (filtered.orderStatus === 'out_for_delivery') filtered.outForDeliveryAt = now;
    if (filtered.orderStatus === 'completed' || filtered.deliveryOtpVerified)
      filtered.deliveryConfirmedAt = filtered.deliveryConfirmedAt || now;
    if (filtered.orderStatus === 'cancelled') filtered.cancelledAt = now;

    if (filtered.orderStatus === 'confirmed') {
      await onOrderConfirmed(scheduler, db, order, orderId);
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

export const deleteOrder = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
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

// ✅ Customer requests a refund
export const requestRefund = mutation({
  args: {
    orderId:       v.string(),
    refundReason:  v.string(),
    refundComment: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, refundReason, refundComment }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false, error: 'Order not found' };

    // Only allow refund on delivered orders that don't already have a refund request
    const status = (order.orderStatus || order.status || '').toLowerCase();
    const isDelivered = status === 'delivered' || status === 'completed';
    if (!isDelivered) return { success: false, error: 'Order is not delivered' };
    if (order.refundStatus) return { success: false, error: 'Refund already requested' };

    await db.patch(order._id, {
      refundStatus:      'requested',
      refundReason,
      refundComment:     refundComment || '',
      refundRequestedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// ✅ Admin approves or rejects a refund
export const resolveRefund = mutation({
  args: {
    orderId:        v.string(),
    refundStatus:   v.string(), // 'approved' | 'rejected'
    refundAdminNote: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, refundStatus, refundAdminNote }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    await db.patch(order._id, {
      refundStatus,
      refundAdminNote: refundAdminNote || '',
      refundResolvedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});