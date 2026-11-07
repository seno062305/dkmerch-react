// convex/pickupRequests.ts
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
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

/** Rider claims a paid/confirmed order by scanning the waybill — no admin approval. */
export const claimOrderByWaybill = mutation({
  args: {
    orderId: v.string(),
    riderId: v.string(),
    riderName: v.string(),
    riderEmail: v.string(),
    riderPhone: v.optional(v.string()),
    riderVehicle: v.optional(v.string()),
    riderPlate: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const orderId = args.orderId.trim();
    const order =
      (await db.query("orders").withIndex("by_orderId", q => q.eq("orderId", orderId)).first()) ||
      (await db.query("orders").collect()).find(
        o => o.orderId === orderId || o.orderId?.slice(-8).toUpperCase() === orderId.slice(-8).toUpperCase()
      );

    if (!order) {
      return { success: false, message: "Order not found. Check the waybill and try again." };
    }

    const status = (order.orderStatus || order.status || "").toLowerCase();
    if (["completed", "delivered", "cancelled", "out_for_delivery"].includes(status)) {
      return { success: false, message: `Order is already ${status.replace(/_/g, " ")}.` };
    }
    if (status !== "confirmed" && status !== "shipped") {
      return { success: false, message: "Only confirmed (paid) orders can be claimed." };
    }

    const existing = await db.query("pickupRequests").collect();
    const forOrder = existing.filter(p => p.orderId === order.orderId);
    const claimed = forOrder.find(p =>
      ["approved", "out_for_delivery", "completed"].includes(p.status)
    );
    if (claimed) {
      if (claimed.riderEmail === args.riderEmail) {
        return {
          success: true,
          alreadyClaimed: true,
          id: claimed._id,
          orderId: order.orderId,
          message: "This order is already in your pickups.",
        };
      }
      return { success: false, message: "Another rider already claimed this order." };
    }

    // Upgrade this rider's pending request if any; drop other riders' pending rows
    const minePending = forOrder.find(
      p => p.riderEmail === args.riderEmail && p.status === "pending"
    );
    const now = new Date().toISOString();

    for (const p of forOrder) {
      if (p.status === "pending" && p.riderEmail !== args.riderEmail) {
        await db.patch(p._id, { status: "rejected", rejectedAt: now });
      }
    }

    if (minePending) {
      await db.patch(minePending._id, {
        status: "approved",
        approvedAt: now,
        customerName: order.customerName || minePending.customerName,
        total: order.finalTotal ?? order.total ?? minePending.total,
      });
      await db.patch(order._id, {
        riderId: args.riderId,
        riderInfo: {
          name: args.riderName,
          phone: args.riderPhone || "",
          vehicle: args.riderVehicle || "motorcycle",
          plate: args.riderPlate || "",
          email: args.riderEmail,
        },
      });
      return { success: true, id: minePending._id, orderId: order.orderId };
    }

    const id = await db.insert("pickupRequests", {
      orderId: order.orderId,
      riderId: args.riderId,
      riderName: args.riderName,
      riderEmail: args.riderEmail,
      riderPhone: args.riderPhone || "",
      riderVehicle: args.riderVehicle || "motorcycle",
      riderPlate: args.riderPlate || "",
      customerName: order.customerName || "",
      total: order.finalTotal ?? order.total ?? 0,
      requestedAt: now,
      status: "approved",
      approvedAt: now,
    });

    await db.patch(order._id, {
      riderId: args.riderId,
      riderInfo: {
        name: args.riderName,
        phone: args.riderPhone || "",
        vehicle: args.riderVehicle || "motorcycle",
        plate: args.riderPlate || "",
        email: args.riderEmail,
      },
    });

    return { success: true, id, orderId: order.orderId };
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

// ── APPROVE — patches DB then fires email via action ──────────────────────────
export const approvePickupRequest = mutation({
  args: { requestId: v.id("pickupRequests") },
  handler: async ({ db, scheduler }, { requestId }) => {
    const req = await db.get(requestId);
    if (!req) return { success: false };

    await db.patch(requestId, {
      status: "approved",
      approvedAt: new Date().toISOString(),
    });

    // Fetch the related order to get customer name & total for the email
    const order = await db
      .query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", req.orderId))
      .first();

    // Fire-and-forget email to the rider
    if (req.riderEmail) {
      await scheduler.runAfter(0, internal.sendEmail.sendPickupApprovedEmail, {
        to:           req.riderEmail,
        riderName:    req.riderName,
        orderId:      req.orderId,
        customerName: req.customerName ?? order?.customerName ?? "Customer",
        total:        req.total ?? order?.finalTotal ?? order?.total ?? 0,
      });
    }

    return { success: true };
  },
});

// ── REJECT — patches DB then fires email via action ───────────────────────────
export const rejectPickupRequest = mutation({
  args: { requestId: v.id("pickupRequests") },
  handler: async ({ db, scheduler }, { requestId }) => {
    const req = await db.get(requestId);
    if (!req) return { success: false };

    await db.patch(requestId, {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    });

    // Fire-and-forget email to the rider
    if (req.riderEmail) {
      await scheduler.runAfter(0, internal.sendEmail.sendPickupRejectedEmail, {
        to:        req.riderEmail,
        riderName: req.riderName,
        orderId:   req.orderId,
      });
    }

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