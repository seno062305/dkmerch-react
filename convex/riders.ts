// convex/riders.ts
import { query, mutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const genSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

// ── Generate DKMerch Rider ID: DKR-YYYY-XXXX ──
const generateDkRiderId = (sequence: number): string => {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(4, '0');
  return `DKR-${year}-${seq}`;
};

export const getAllRiders = query(async ({ db }) => {
  return await db.query("riderApplications").collect();
});

export const getRiderByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
  },
});

export const getRidersByStatus = query({
  args: { status: v.string() },
  handler: async ({ db }, { status }) => {
    return await db
      .query("riderApplications")
      .withIndex("by_status", q => q.eq("status", status))
      .collect();
  },
});

export const createRiderApplication = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    password: v.optional(v.string()),
    riderPhoto: v.optional(v.union(v.string(), v.null())),
    validId1: v.optional(v.union(v.string(), v.null())),
    validId2: v.optional(v.union(v.string(), v.null())),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existing) {
      return { success: false, message: "This email is already registered as a rider applicant." };
    }
    const id = await db.insert("riderApplications", {
      fullName: args.fullName,
      email: args.email,
      phone: args.phone,
      vehicleType: args.vehicleType,
      status: "pending",
      appliedAt: new Date().toISOString(),
      address: args.address,
      plateNumber: args.plateNumber,
      licenseNumber: args.licenseNumber,
      password: args.password,
      riderPhoto: args.riderPhoto,
      validId1: args.validId1,
      validId2: args.validId2,
    });
    return { success: true, id };
  },
});

export const approveRider = mutation({
  args: { id: v.id("riderApplications") },
  handler: async ({ db }, { id }) => {
    const allRiders = await db.query("riderApplications").collect();
    const approvedCount = allRiders.filter(r => r.dkRiderId).length;
    const nextSeq = approvedCount + 1;
    const dkRiderId = generateDkRiderId(nextSeq);

    await db.patch(id, {
      status: "approved",
      dkRiderId,
      dkRiderIdGeneratedAt: new Date().toISOString(),
    });
    return { success: true, dkRiderId };
  },
});

export const updateRiderStatus = mutation({
  args: { id: v.id("riderApplications"), status: v.string() },
  handler: async ({ db }, { id, status }) => {
    await db.patch(id, { status });
    return { success: true };
  },
});

export const updateRider = mutation({
  args: {
    id: v.id("riderApplications"),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await db.patch(id, filtered);
    return { success: true };
  },
});

// ── deleteRider — with reason + optional email (for approved/suspended) ───────
export const deleteRider = mutation({
  args: {
    id:        v.id("riderApplications"),
    reason:    v.optional(v.string()),
    note:      v.optional(v.string()),
    sendEmail: v.optional(v.boolean()),
  },
  handler: async ({ db, scheduler }, { id, reason, note, sendEmail }) => {
    const rider = await db.get(id);
    if (!rider) return { success: false };

    await db.delete(id);

    // Only send email for approved/suspended riders when explicitly true
    if (sendEmail && rider.email && reason) {
      await scheduler.runAfter(0, internal.sendEmail.sendRiderDeletedEmail, {
        to:        rider.email,
        riderName: rider.fullName,
        reason,
        note:      note ?? undefined,
      });
    }

    return { success: true };
  },
});

// ── rejectRiderApplication — deletes application + sends rejection email ──────
// Called from AdminRiders.jsx via useMutation (NOT useAction)
// Email is fired via scheduler (non-blocking) so no useAction needed on frontend
export const rejectRiderApplication = mutation({
  args: {
    id:     v.id("riderApplications"),
    reason: v.string(),
    note:   v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { id, reason, note }) => {
    const rider = await db.get(id);
    if (!rider) return { success: false };

    await db.delete(id);

    // Fire rejection email via scheduler (non-blocking)
    if (rider.email) {
      await scheduler.runAfter(0, internal.sendEmail.sendRiderRejectedEmail, {
        to:        rider.email,
        riderName: rider.fullName,
        reason,
        note:      note ?? undefined,
      });
    }

    return { success: true };
  },
});

export const loginRider = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async ({ db }, { email, password }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!rider) {
      return { success: false, riderExists: false, message: "No rider account found." };
    }

    const status = rider.status?.toLowerCase();

    if (status === "pending") {
      return {
        success: false, riderExists: true,
        message: "⏳ Your rider application is still pending admin approval. Please wait.",
      };
    }
    if (status === "rejected") {
      return {
        success: false, riderExists: true,
        message: "❌ Your rider application was not approved. Please contact support.",
      };
    }
    if (status === "suspended") {
      return {
        success: false, riderExists: true,
        message: "🚫 Your rider account has been suspended. Please contact admin.",
      };
    }
    if (rider.password && rider.password !== password) {
      return {
        success: false, riderExists: true,
        message: "Incorrect password. Please try again.",
      };
    }

    const newSessionId = genSessionId();
    await db.patch(rider._id, {
      activeSessionId: newSessionId,
      activeDeviceAt: Date.now(),
      kickedAt: undefined,
    });

    return {
      success: true,
      riderExists: true,
      rider: {
        _id: rider._id,
        name: rider.fullName,
        email: rider.email,
        role: "rider",
        status: rider.status,
        dkRiderId: rider.dkRiderId,
      },
      sessionId: newSessionId,
    };
  },
});

export const checkRiderSession = query({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!rider) return { valid: false, reason: "rider_not_found" };
    if (!rider.activeSessionId) return { valid: true };

    const isValid = rider.activeSessionId === sessionId;
    return {
      valid: isValid,
      reason: isValid ? "ok" : "new_device_logged_in",
      activeDeviceAt: rider.activeDeviceAt,
      kickedAt: rider.kickedAt ?? null,
    };
  },
});

export const setRiderKickedAt = mutation({
  args: { email: v.string(), kickedAt: v.number() },
  handler: async ({ db }, { email, kickedAt }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    await db.patch(rider._id, { kickedAt });
    return { success: true };
  },
});

// ── updateRiderLocation ──
export const updateRiderLocation = mutation({
  args: {
    orderId: v.string(),
    riderEmail: v.string(),
    riderName: v.string(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    heading: v.optional(v.number()),
    speed: v.optional(v.number()),
    isTracking: v.boolean(),
    sessionId: v.optional(v.string()),
    lastKnownAddress: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();

    const now = Date.now();
    const isRealPosition = args.lat !== 0 && args.lng !== 0;

    const patch: any = {
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      heading: args.heading,
      speed: args.speed,
      isTracking: args.isTracking,
      updatedAt: now,
      sessionId: args.sessionId,
    };

    if (isRealPosition) {
      patch.lastKnownLat     = args.lat;
      patch.lastKnownLng     = args.lng;
      patch.lastKnownAt      = now;
      patch.lastKnownAddress = args.lastKnownAddress ?? null;
    }

    if (existing) {
      await db.patch(existing._id, patch);
    } else {
      await db.insert("riderLocations", {
        orderId:    args.orderId,
        riderEmail: args.riderEmail,
        riderName:  args.riderName,
        ...patch,
      });
    }

    return { success: true };
  },
});

export const getRiderLocation = query({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    return await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
  },
});

export const getAllRiderLastLocations = query({
  handler: async ({ db }) => {
    return await db.query("riderLocations").collect();
  },
});

export const stopRiderTracking = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const existing = await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();

    if (existing) {
      await db.patch(existing._id, {
        isTracking: false,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RIDER LINK SESSION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const MAX_CONCURRENT_SESSIONS = 5;
const SESSION_TIMEOUT_MS      = 2 * 60 * 1000; // 2 minutes

export const claimRiderLinkSession = mutation({
  args: {
    orderId:    v.string(),
    sessionId:  v.string(),
    deviceInfo: v.optional(v.string()),
  },
  handler: async ({ db }, { orderId, sessionId, deviceInfo }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();

    if (!order) return { allowed: false, reason: "order_not_found" };

    const now            = Date.now();
    const sessions: Record<string, { at: number; deviceInfo: string }> =
      (order.riderLinkSessions as any) ?? {};

    const activeSessions: Record<string, { at: number; deviceInfo: string }> = {};
    for (const [sid, data] of Object.entries(sessions)) {
      if (now - data.at < SESSION_TIMEOUT_MS) {
        activeSessions[sid] = data;
      }
    }

    const isReturning = !!activeSessions[sessionId];
    const otherSessions = Object.entries(activeSessions).filter(([sid]) => sid !== sessionId);

    if (!isReturning && otherSessions.length >= MAX_CONCURRENT_SESSIONS) {
      return {
        allowed:        false,
        reason:         "too_many_sessions",
        activeCount:    otherSessions.length,
        sessionDetails: otherSessions.map(([, d]) => d.deviceInfo),
      };
    }

    activeSessions[sessionId] = {
      at:         now,
      deviceInfo: deviceInfo ?? "Unknown device",
    };

    await db.patch(order._id, {
      riderLinkSessions:   activeSessions,
      riderLinkSessionAt:  now,
      riderLinkDeviceInfo: deviceInfo ?? "Unknown device",
    });

    const isNew = !isReturning;
    if (isNew) {
      const riderName = order.riderInfo?.name || "Rider";
      const shortId   = orderId.slice(-8).toUpperCase();
      const device    = deviceInfo ?? "Unknown device";
      const totalNow  = Object.keys(activeSessions).length;

      await db.insert("riderNotifications", {
        type:         "rider_link_opened",
        orderId,
        customerName: order.customerName ?? "Customer",
        total:        order.finalTotal   ?? order.total ?? 0,
        message:      `🛵 ${riderName} opened delivery link on ${device} (Order #${shortId}) · ${totalNow} active session${totalNow > 1 ? 's' : ''}`,
        createdAt:    new Date().toISOString(),
        read:         false,
      });
    }

    return { allowed: true };
  },
});

export const heartbeatRiderLinkSession = mutation({
  args: { orderId: v.string(), sessionId: v.string() },
  handler: async ({ db }, { orderId, sessionId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const now      = Date.now();
    const sessions: Record<string, { at: number; deviceInfo: string }> =
      (order.riderLinkSessions as any) ?? {};

    if (!sessions[sessionId]) {
      return { success: false, reason: "session_expired" };
    }

    sessions[sessionId] = { ...sessions[sessionId], at: now };

    await db.patch(order._id, {
      riderLinkSessions:  sessions,
      riderLinkSessionAt: now,
    });

    return { success: true };
  },
});

export const releaseRiderLinkSession = mutation({
  args: { orderId: v.string(), sessionId: v.string() },
  handler: async ({ db }, { orderId, sessionId }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order) return { success: false };

    const sessions: Record<string, { at: number; deviceInfo: string }> =
      (order.riderLinkSessions as any) ?? {};

    delete sessions[sessionId];

    await db.patch(order._id, { riderLinkSessions: sessions });
    return { success: true };
  },
});

// ── Get all approved rider emails (used by sendEmail for new order blast) ──
export const getAllApprovedRiderEmails = internalQuery({
  handler: async ({ db }): Promise<{ fullName: string; email: string }[]> => {
    const riders = await db
      .query("riderApplications")
      .withIndex("by_status", q => q.eq("status", "approved"))
      .collect();

    return riders
      .filter(r => !!r.email)
      .map(r => ({ fullName: r.fullName, email: r.email }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Required by RiderLoginModal forgot password flow
// ─────────────────────────────────────────────────────────────────────────────

export const resetRiderPasswordByEmail = mutation({
  args: {
    email:       v.string(),
    newPassword: v.string(),
  },
  handler: async ({ db }, { email, newPassword }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!rider) {
      return { success: false, message: "No rider account found with that email." };
    }

    if (rider.status === "rejected") {
      return { success: false, message: "This rider account has been rejected." };
    }

    // Validate @rider password format
    if (!newPassword.startsWith("@rider")) {
      return { success: false, message: "Password must start with @rider." };
    }
    if (newPassword.length < 7 || newPassword.length > 10) {
      return { success: false, message: "Password must be 7–10 characters." };
    }

    await db.patch(rider._id, { password: newPassword });
    return { success: true };
  },
});