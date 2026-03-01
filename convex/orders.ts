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

// ✅ Step 1: Generate upload URL for damage photo
export const generateRefundUploadUrl = mutation({
  args: {},
  handler: async ({ storage }) => {
    return await storage.generateUploadUrl();
  },
});

// ✅ Step 2: Get public URL of uploaded damage photo
export const getRefundPhotoUrl = query({
  args: { storageId: v.string() },
  handler: async ({ storage }, { storageId }) => {
    return await storage.getUrl(storageId);
  },
});

// ✅ Step 3: Customer submits refund request
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
      resolvedAt:          null,  // stored in history only — allowed as any
      adminNote:           null,  // stored in history only — allowed as any
    };

    const existingHistory = (order as any).refundHistory || [];

    await db.patch(order._id, {
      // ✅ Use undefined instead of null for optional string/number fields
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

// ✅ Step 4: Admin approves or rejects a refund
// - If approved: refundAmount auto-computed from finalTotal, email sent to customer
// - If rejected: email sent to customer with admin note
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

    // Auto-compute refund amount from order final total
    const refundAmount = (order as any).finalTotal ?? (order as any).total ?? 0;

    // Update the latest history entry
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

    // ── Send email notification to customer ──────────────────────────────────
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