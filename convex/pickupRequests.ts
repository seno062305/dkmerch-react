// convex/pickupRequests.ts
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { insertCustomerNotification } from "./customerNotifications";

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

    if (await isLbcDelivery(db, order)) {
      return { success: false, message: "This order ships via LBC Express (outside rider area) — not available for riders." };
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
    riderPhoto: v.optional(v.union(v.string(), v.null())),
  },
  handler: async ({ db, scheduler }, args) => {
    const order = await findOrderByIdOrShort(db, args.orderId);
    if (!order) {
      return { success: false, message: "Order not found." };
    }

    if (await isLbcDelivery(db, order)) {
      return { success: false, message: "This order ships via LBC Express (outside rider area) — not available for riders." };
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
    // Prefer live admin photo from riderApplications so customers always see the face pic
    let resolvedPhoto = args.riderPhoto || "";
    if (!resolvedPhoto && args.riderEmail) {
      const app = await db
        .query("riderApplications")
        .withIndex("by_email", (q: any) => q.eq("email", String(args.riderEmail).trim()))
        .first();
      if (app?.riderPhoto) resolvedPhoto = app.riderPhoto;
    }
    const riderInfo = {
      name: args.riderName,
      phone: args.riderPhone || "",
      vehicle: args.riderVehicle || "motorcycle",
      plate: args.riderPlate || "",
      email: args.riderEmail,
      photo: resolvedPhoto || "",
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

    const notifyRiderAccepted = async () => {
      if (!order.email) return;
      await scheduler.runAfter(0, internal.sendEmail.sendOrderStatusUpdateEmail, {
        to: order.email,
        customerName: order.customerName || "Customer",
        orderId: order.orderId,
        orderStatus: "rider_assigned",
        actorLabel: "Rider",
        note: `${args.riderName} accepted your order and will deliver it soon.`,
      });
      await scheduler.runAfter(0, internal.webPush.sendToEmail, {
        email: order.email,
        title: "Rider assigned",
        body: `${args.riderName} accepted your order.`,
        url: `/track-order?order=${encodeURIComponent(order.orderId)}`,
      });
      await insertCustomerNotification(db, {
        email: order.email,
        type: "rider_assigned",
        title: "Rider assigned",
        body: `${args.riderName} accepted your order and will deliver it soon.`,
        url: `/track-order?order=${encodeURIComponent(order.orderId)}`,
        orderId: order.orderId,
      });
    };

    if (mine) {
      await db.patch(mine._id, {
        status: "approved",
        approvedAt: now,
        customerName: order.customerName || mine.customerName || "",
        total: order.finalTotal ?? order.total ?? mine.total ?? 0,
      });
      await db.patch(order._id, {
        riderId: args.riderId,
        riderInfo,
        orderStatus: status === "confirmed" ? "shipped" : order.orderStatus,
        status: status === "confirmed" ? "Shipped" : order.status,
        shippedAt: status === "confirmed" ? now : order.shippedAt,
      });
      await notifyRiderAccepted();
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

    await db.patch(order._id, {
      riderId: args.riderId,
      riderInfo,
      orderStatus: status === "confirmed" ? "shipped" : order.orderStatus,
      status: status === "confirmed" ? "Shipped" : order.status,
      shippedAt: status === "confirmed" ? now : order.shippedAt,
    });
    await notifyRiderAccepted();
    return { success: true, id, orderId: order.orderId, fromScan: true };
  },
});

async function resetClaimedOrderToAvailable(db: any, order: any, orderId: string, pickups: any[]) {
  for (const p of pickups.filter((x: any) => x.orderId === orderId || (order && x.orderId === order.orderId))) {
    await db.delete(p._id);
  }

  const locs = await db
    .query("riderLocations")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .collect();
  for (const loc of locs) {
    await db.delete(loc._id);
  }
  if (order?.orderId && order.orderId !== orderId) {
    const locs2 = await db
      .query("riderLocations")
      .withIndex("by_orderId", (q) => q.eq("orderId", order.orderId))
      .collect();
    for (const loc of locs2) {
      await db.delete(loc._id);
    }
  }

  if (order) {
    const {
      riderId: _r,
      riderInfo: _ri,
      outForDeliveryAt: _ofd,
      riderGpsLink: _link,
      riderLinkSessionId: _sid,
      riderLinkSessionAt: _sat,
      riderLinkDeviceInfo: _dev,
      deliveryOtp: _otp,
      deliveryOtpVerified: _otpv,
      deliveryConfirmedAt: _dca,
      deliveryProofUrl: _dpu,
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
    orderId: order?.orderId || orderId,
    shortId: String(order?.orderId || orderId).slice(-8).toUpperCase(),
    total: order?.finalTotal ?? order?.total ?? null,
    message: `Order #${String(order?.orderId || orderId).slice(-8).toUpperCase()} is back on Available.`,
  };
}

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
    return await resetClaimedOrderToAvailable(db, order, orderId, pickups);
  },
});

/** Dev/test helper: reset a claimed/completed order matching a total amount back to Available. */
export const resetOrderByTotalToAvailable = mutation({
  args: { total: v.number() },
  handler: async ({ db }, { total }) => {
    const target = Number(total);
    const pickups = await db.query("pickupRequests").order("desc").collect();
    const orders = await db.query("orders").order("desc").collect();

    // Prefer active claimed pickups with this total, then any order with this total
    const claimedPickup = pickups.find((p: any) => {
      const t = Number(p.total ?? 0);
      return Math.abs(t - target) < 0.01 && ["approved", "out_for_delivery", "completed", "scanned"].includes(p.status);
    });

    let order: any = null;
    let orderId = "";

    if (claimedPickup) {
      order = await findOrderByIdOrShort(db, claimedPickup.orderId);
      orderId = order?.orderId || claimedPickup.orderId;
    } else {
      order = orders.find((o: any) => {
        const t = Number(o.finalTotal ?? o.total ?? 0);
        return Math.abs(t - target) < 0.01;
      });
      if (!order) {
        return { success: false, message: `No order found with total ₱${target.toLocaleString()}.` };
      }
      orderId = order.orderId;
    }

    return await resetClaimedOrderToAvailable(db, order, orderId, pickups);
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