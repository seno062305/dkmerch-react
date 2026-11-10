// convex/orders.ts
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    deliveryMethod: v.optional(v.string()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
    isRewardOrder: v.optional(v.boolean()),
    rewardTicketCode: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    await db.insert("orders", args);
    return { success: true, orderId: args.orderId };
  },
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
const NCR_BOUNDS = { minLat: 14.35, maxLat: 14.80, minLng: 120.86, maxLng: 121.15 };

function isLbcDelivery(order: any): boolean {
  if (!order) return false;
  if (order.deliveryMethod === 'lbc') return true;
  if (order.deliveryMethod === 'rider') return false;
  const lat = Number(order.addressLat);
  const lng = Number(order.addressLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return !(
    lat >= NCR_BOUNDS.minLat && lat <= NCR_BOUNDS.maxLat &&
    lng >= NCR_BOUNDS.minLng && lng <= NCR_BOUNDS.maxLng
  );
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
  const isLbc          = isLbcDelivery(order);

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
  }

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
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId,
        orderStatus,
        actorLabel: "Admin",
        note: orderStatus === "cancelled" ? (order.cancelReason || undefined) : undefined,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Order update · #${orderId.slice(-8).toUpperCase()}`,
        body: `Status: ${String(orderStatus).replace(/_/g, " ")}`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
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
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || 'Customer',
        orderId,
        orderStatus: filtered.orderStatus,
        actorLabel,
        note:
          filtered.orderStatus === 'cancelled'
            ? (filtered.cancelReason || order.cancelReason || undefined)
            : undefined,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Order update · #${orderId.slice(-8).toUpperCase()}`,
        body: `${actorLabel}: ${String(filtered.orderStatus).replace(/_/g, ' ')}`,
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
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

    const riderInfo = {
      name: args.riderName,
      phone: args.riderPhone || "",
      vehicle: args.riderVehicle || "motorcycle",
      plate: args.riderPlate || "",
      email: args.riderEmail || "",
      photo: args.riderPhoto || (order as any).riderInfo?.photo || "",
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
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Cancel request declined · #${orderId.slice(-8).toUpperCase()}`,
        body: adminNote || "Your cancel request was not approved. The order will continue.",
        url: `/track-order?order=${encodeURIComponent(orderId)}`,
      });
    }
    return { success: true };
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

    if (wasPaid && !args.proofPhotoId) {
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
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: `Cancel approved · #${shortId}`,
        body: wasPaid
          ? `Refund ₱${amount.toLocaleString("en-PH")} is on the way to your wallet.`
          : "Your cancel request was approved. Order cancelled.",
        url: `/track-order?order=${encodeURIComponent(args.orderId)}`,
      });
    }

    return { success: true, refunded: !!args.refunded, refundAmount: wasPaid ? amount : 0 };
  },
});