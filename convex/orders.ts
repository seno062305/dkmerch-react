// convex/orders.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
    status: v.string(),
    orderStatus: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
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

// ✅ FIXED: now accepts both status AND orderStatus
export const updateOrderStatus = mutation({
  args: {
    orderId: v.string(),
    status: v.string(),
    orderStatus: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, status, orderStatus }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const updates: any = { status };
    if (orderStatus !== undefined) updates.orderStatus = orderStatus;

    await db.patch(order._id, updates);
    return { success: true };
  },
});

export const updateOrderFields = mutation({
  args: {
    orderId: v.string(),
    status: v.optional(v.string()),
    orderStatus: v.optional(v.string()),
    riderId: v.optional(v.string()),
    riderInfo: v.optional(v.any()),
    deliveryOtp: v.optional(v.string()),
    deliveryOtpVerified: v.optional(v.boolean()),
    deliveryProofPhoto: v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, ...updates }) => {
    const order = await db.query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
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