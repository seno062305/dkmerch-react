// convex/pickupRequests.ts
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const getAllPickupRequests = query(async ({ db }) => {
  return await db.query("pickupRequests").order("desc").collect();
});

export const getPendingPickupRequests = query(async ({ db }) => {
  return await db.query("pickupRequests")
    .order("desc")
    .filter(q => q.eq(q.field("status"), "pending"))
    .collect();
});

export const getPickupsByRider = query({
  args: { riderId: v.string() },
  handler: async ({ db }, { riderId }) => {
    return await db.query("pickupRequests")
      .withIndex("by_rider", q => q.eq("riderId", riderId))
      .order("desc")
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

async function findOrderByIdOrShort(db: any, orderIdRaw: string) {
  const orderId = orderIdRaw.trim();
  const exact = await db.query("orders").withIndex("by_orderId", (q: any) => q.eq("orderId", orderId)).first();
  if (exact) return exact;
  const short = orderId.slice(-8).toUpperCase();
  const all = await db.query("orders").collect();
  return all.find(
    (o: any) => o.orderId === orderId || o.orderId?.slice(-8).toUpperCase() === short
  ) || null;
}

/** Scan waybill → mark order for Available Orders (does not accept yet). */
export const markOrderFromScan = mutation({
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
    const order = await findOrderByIdOrShort(db, args.orderId);
    if (!order) {
      return { success: false, message: "Order not found. Check the waybill and try again." };
    }

    const status = (order.orderStatus || order.status || "").toLowerCase();
    if (["completed", "delivered", "cancelled", "out_for_delivery"].includes(status)) {
      return { success: false, message: `Order is already ${status.replace(/_/g, " ")}.` };
    }
    if (status !== "confirmed" && status !== "shipped") {
      return { success: false, message: "Only confirmed (paid) orders can be scanned." };
    }

    const existing = await db.query("pickupRequests").collect();
    const forOrder = existing.filter((p: any) => p.orderId === order.orderId);
    const claimed = forOrder.find((p: any) =>
      ["approved", "out_for_delivery", "completed"].includes(p.status)
    );
    if (claimed) {
      if (claimed.riderEmail === args.riderEmail) {
        return {
          success: true,
          alreadyClaimed: true,
          orderId: order.orderId,
          message: "You already accepted this order — check Deliver.",
        };
      }
      return { success: false, message: "Another rider already accepted this order." };
    }

    const now = new Date().toISOString();
    const mine = forOrder.find(
      (p: any) => p.riderEmail === args.riderEmail && (p.status === "scanned" || p.status === "pending")
    );

    if (mine) {
      await db.patch(mine._id, {
        status: "scanned",
        fromScan: true,
        scannedAt: now,
        customerName: order.customerName || mine.customerName,
        total: order.finalTotal ?? order.total ?? mine.total,
      });
      return { success: true, id: mine._id, orderId: order.orderId, fromScan: true };
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
      status: "scanned",
      fromScan: true,
      scannedAt: now,
    });

    return { success: true, id, orderId: order.orderId, fromScan: true };
  },
});

/**
 * Accept via waybill scan → Deliver as "approved" (Ready to Deliver).
 * GPS / Out for Delivery starts only when rider taps Notify Customer.
 */
export const acceptOrder = mutation({
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
    const order = await findOrderByIdOrShort(db, args.orderId);
    if (!order) {
      return { success: false, message: "Order not found." };
    }

    const status = (order.orderStatus || order.status || "").toLowerCase();
    if (["completed", "delivered", "cancelled", "out_for_delivery"].includes(status)) {
      return { success: false, message: `Order is already ${status.replace(/_/g, " ")}.` };
    }
    if (status !== "confirmed" && status !== "shipped") {
      return { success: false, message: "Only confirmed orders can be accepted." };
    }

    const existing = await db.query("pickupRequests").collect();
    const forOrder = existing.filter((p: any) => p.orderId === order.orderId);
    const claimed = forOrder.find((p: any) =>
      ["approved", "out_for_delivery", "completed"].includes(p.status)
    );

    const now = new Date().toISOString();
    const riderInfo = {
      name: args.riderName,
      phone: args.riderPhone || "",
      vehicle: args.riderVehicle || "motorcycle",
      plate: args.riderPlate || "",
      email: args.riderEmail,
    };

    if (claimed) {
      if (claimed.riderEmail === args.riderEmail) {
        return { success: true, alreadyClaimed: true, id: claimed._id, orderId: order.orderId };
      }
      return { success: false, message: "Another rider already accepted this order." };
    }

    const mine = forOrder.find(
      (p: any) =>
        p.riderEmail === args.riderEmail &&
        (p.status === "scanned" || p.status === "pending")
    );

    for (const p of forOrder) {
      if (
        p.riderEmail !== args.riderEmail &&
        (p.status === "scanned" || p.status === "pending")
      ) {
        await db.patch(p._id, { status: "rejected", rejectedAt: now });
      }
    }

    if (mine) {
      await db.patch(mine._id, {
        status: "approved",
        approvedAt: now,
        customerName: order.customerName || mine.customerName || "",
        total: order.finalTotal ?? order.total ?? mine.total ?? 0,
      });
      await db.patch(order._id, { riderId: args.riderId, riderInfo });
      return { success: true, id: mine._id, orderId: order.orderId, fromScan: !!mine.fromScan };
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
      fromScan: true,
      scannedAt: now,
    });

    await db.patch(order._id, { riderId: args.riderId, riderInfo });
    return { success: true, id, orderId: order.orderId, fromScan: true };
  },
});

/** Dev/test helper: put the latest claimed delivery back to Available (confirmed). */
export const resetLatestClaimedToAvailable = mutation({
  args: {},
  handler: async ({ db }) => {
    const pickups = await db.query("pickupRequests").order("desc").collect();
    const claimed = pickups.find((p: any) =>
      ["approved", "out_for_delivery"].includes(p.status)
    );
    if (!claimed) {
      return { success: false, message: "No claimed delivery to reset." };
    }

    const order = await findOrderByIdOrShort(db, claimed.orderId);
    const orderId = order?.orderId || claimed.orderId;

    // Remove all pickups for this order
    for (const p of pickups.filter((x: any) => x.orderId === orderId)) {
      await db.delete(p._id);
    }

    // Clear live GPS so customer/admin maps stop showing this rider
    const locs = await db
      .query("riderLocations")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .collect();
    for (const loc of locs) {
      await db.delete(loc._id);
    }

    if (order) {
      // Rebuild doc without rider/delivery fields so admin + customer maps clear
      const {
        riderId: _r,
        riderInfo: _ri,
        outForDeliveryAt: _ofd,
        riderGpsLink: _link,
        riderLinkSessionId: _sid,
        riderLinkSessionAt: _sat,
        riderLinkDeviceInfo: _dev,
        ...rest
      } = order as any;
      await db.replace(order._id, {
        ...rest,
        orderStatus: "confirmed",
        status: "Confirmed",
      });
    }

    return {
      success: true,
      orderId,
      shortId: String(orderId).slice(-8).toUpperCase(),
      message: `Order #${String(orderId).slice(-8).toUpperCase()} is back on Available.`,
    };
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