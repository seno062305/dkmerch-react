// convex/pickupRequests.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getAllPickupRequests = query(async ({ db }) => {
  return await db.query("pickupRequests").collect();
});

export const getPendingPickupRequests = query(async ({ db }) => {
  return await db.query("pickupRequests")
    .filter(q => q.eq(q.field("status"), "pending"))
    .collect();
});

export const getPickupsByRider = query({
  args: { riderId: v.string() },
  handler: async ({ db }, { riderId }) => {
    return await db.query("pickupRequests")
      .withIndex("by_rider", q => q.eq("riderId", riderId))
      .collect();
  },
});

export const createPickupRequest = mutation({
  args: {
    orderId: v.string(),
    riderId: v.string(),
    riderName: v.string(),
    riderEmail: v.string(),
    riderPhone: v.optional(v.string()),
    riderVehicle: v.optional(v.string()),
    riderPlate: v.optional(v.string()),
    customerName: v.optional(v.string()),
    total: v.optional(v.number()),
    requestedAt: v.string(),
    status: v.string(),
  },
  handler: async ({ db }, args) => {
    const id = await db.insert("pickupRequests", args);
    return { success: true, id };
  },
});

export const updatePickupStatus = mutation({
  args: {
    requestId: v.id("pickupRequests"),
    status: v.string(),
  },
  handler: async ({ db }, { requestId, status }) => {
    const updates: Record<string, string> = { status };
    if (status === 'approved') updates.approvedAt = new Date().toISOString();
    if (status === 'rejected') updates.rejectedAt = new Date().toISOString();
    await db.patch(requestId, updates);
    return { success: true };
  },
});

export const approvePickupRequest = mutation({
  args: { requestId: v.id("pickupRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, {
      status: "approved",
      approvedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const rejectPickupRequest = mutation({
  args: { requestId: v.id("pickupRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    });
    return { success: true };
  },
});

export const deletePickupRequest = mutation({
  args: { requestId: v.id("pickupRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.delete(requestId);
    return { success: true };
  },
});

export const updatePickupRequest = mutation({
  args: {
    requestId: v.id("pickupRequests"),
    status: v.optional(v.string()),
    approvedAt: v.optional(v.string()),
    rejectedAt: v.optional(v.string()),
  },
  handler: async ({ db }, { requestId, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await db.patch(requestId, filtered);
    return { success: true };
  },
});