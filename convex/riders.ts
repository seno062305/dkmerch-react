// convex/riders.ts
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const genSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

/** Always 60s window — resets on every new login request */
const RIDER_LOGIN_ALERT_TTL_MS = 60 * 1000;

function isRiderLoginAlertExpired(alert: any, now = Date.now()) {
  if (!alert) return true;
  const expiresAt = Number(alert.expiresAt) || (Number(alert.at) || 0) + RIDER_LOGIN_ALERT_TTL_MS;
  return expiresAt > 0 && now >= expiresAt;
}

// ── Generate DKMerch Rider ID: DKR-YYYY-XXXX ──
const generateDkRiderId = (sequence: number): string => {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(4, '0');
  return `DKR-${year}-${seq}`;
};

export const getAllRiders = query(async ({ db }) => {
  return await db.query("riderApplications").order("desc").collect();
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
      .order("desc")
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

// Admin fills rider details and creates an already-approved rider account
export const adminCreateRider = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    password: v.string(),
    riderPhoto: v.optional(v.union(v.string(), v.null())),
  },
  handler: async ({ db }, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (existing) {
      return { success: false, message: "A rider with this email already exists." };
    }

    const allRiders = await db.query("riderApplications").collect();
    const approvedCount = allRiders.filter(r => r.dkRiderId).length;
    const dkRiderId = generateDkRiderId(approvedCount + 1);

    const id = await db.insert("riderApplications", {
      fullName: args.fullName.trim(),
      email,
      phone: args.phone.trim(),
      address: args.address?.trim() || undefined,
      vehicleType: args.vehicleType || "motorcycle",
      plateNumber: args.plateNumber?.trim() || undefined,
      licenseNumber: args.licenseNumber?.trim() || undefined,
      password: args.password,
      riderPhoto: args.riderPhoto || undefined,
      status: "approved",
      appliedAt: new Date().toISOString(),
      dkRiderId,
      dkRiderIdGeneratedAt: new Date().toISOString(),
    });

    return { success: true, id, dkRiderId, email, fullName: args.fullName.trim() };
  },
});

/** Admin (or rider profile) — set/replace the face photo customers see. */
export const updateRiderPhoto = mutation({
  args: {
    id: v.id("riderApplications"),
    riderPhoto: v.union(v.string(), v.null()),
  },
  handler: async ({ db }, { id, riderPhoto }) => {
    const rider = await db.get(id);
    if (!rider) return { success: false, message: "Rider not found." };
    await db.patch(id, { riderPhoto: riderPhoto || null });
    return { success: true };
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


function getRiderSessionIds(rider: any): string[] {
  const fromArr = Array.isArray(rider?.activeSessionIds)
    ? rider.activeSessionIds.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];
  const primary = String(rider?.activeSessionId || "").trim();
  if (primary && !fromArr.includes(primary)) return [primary, ...fromArr];
  return fromArr;
}

function activateRiderSessionPatch(
  sessionId: string,
  now: number,
  deviceName: string,
  location: string,
  platform: string,
  sessionIds?: string[],
) {
  const ids = [...new Set((sessionIds && sessionIds.length ? sessionIds : [sessionId])
    .map((s) => String(s || "").trim())
    .filter(Boolean))];
  return {
    activeSessionId: sessionId,
    activeSessionIds: ids,
    activeDeviceAt: now,
    activeDeviceName: deviceName,
    activeDeviceLocation: location,
    activeDevicePlatform: platform || undefined,
    kickedAt: undefined,
    loginAlert: undefined,
  };
}

export const loginRider = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    deviceName: v.optional(v.string()),
    location: v.optional(v.string()),
    platform: v.optional(v.string()),
    currentSessionId: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, args) => {
    const { email, password } = args;
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

    const now = Date.now();
    const deviceName = String(args.deviceName || "Unknown device").slice(0, 120);
    const location = String(args.location || "Unknown location").slice(0, 160);
    const platform = String(args.platform || "").slice(0, 80);
    const existingIds = getRiderSessionIds(rider);
    const previousSessionId = existingIds[0];
    const currentSessionId = String(args.currentSessionId || "").trim();

    const safeRider = {
      _id: rider._id,
      name: rider.fullName,
      email: rider.email,
      role: "rider" as const,
      status: rider.status,
      dkRiderId: rider.dkRiderId,
    };

    if (currentSessionId && existingIds.includes(currentSessionId)) {
      const patch = activateRiderSessionPatch(
        currentSessionId,
        now,
        deviceName,
        location,
        platform,
        existingIds,
      ) as any;
      // Keep pending Yes/No so after PIN (from push tap) the modal still appears
      const pending = (rider as any).loginAlert;
      if (
        pending
        && pending.status === "pending"
        && !pending.resolved
        && !isRiderLoginAlertExpired(pending, now)
      ) {
        delete patch.loginAlert;
      }
      await db.patch(rider._id, patch);
      return {
        success: true,
        riderExists: true,
        rider: safeRider,
        sessionId: currentSessionId,
        pendingApproval: false,
      };
    }

    const sessionId = genSessionId();
    const hasOtherSession = existingIds.length > 0;
    const STUCK_PENDING_MS = 15 * 60 * 1000;
    const pendingAlert = (rider as any).loginAlert;
    const pendingAge = pendingAlert?.at ? now - Number(pendingAlert.at) : 0;
    const stuckPending =
      pendingAlert
      && pendingAlert.status === "pending"
      && !pendingAlert.resolved
      && pendingAge > STUCK_PENDING_MS;

    // First login / stuck pending → take over
    if (!hasOtherSession || stuckPending) {
      await db.patch(
        rider._id,
        activateRiderSessionPatch(sessionId, now, deviceName, location, platform) as any,
      );
      return {
        success: true,
        riderExists: true,
        rider: safeRider,
        sessionId,
        pendingApproval: false,
      };
    }

    // Active pending → keep waiting; always reset 60s countdown on re-request
    if (
      pendingAlert
      && pendingAlert.status === "pending"
      && !pendingAlert.resolved
      && !isRiderLoginAlertExpired(pendingAlert, now)
    ) {
      const expiresAt = now + RIDER_LOGIN_ALERT_TTL_MS;
      const alert = {
        sessionId: String(sessionId),
        previousSessionId: previousSessionId || String(pendingAlert.previousSessionId || ""),
        deviceName: deviceName || pendingAlert.deviceName,
        location: location || pendingAlert.location,
        platform: platform || pendingAlert.platform || undefined,
        at: now,
        expiresAt,
        status: "pending" as const,
        resolved: false,
      };
      await db.patch(rider._id, { loginAlert: alert } as any);
      try {
        await scheduler.runAfter(RIDER_LOGIN_ALERT_TTL_MS, internal.riders.expireRiderLoginAlert, {
          email: String(rider.email),
          sessionId: String(alert.sessionId),
        });
      } catch { /* optional */ }
      return {
        success: true,
        riderExists: true,
        rider: safeRider,
        sessionId: String(alert.sessionId),
        pendingApproval: true,
        expiresAt,
      };
    }

    // Another device still has a session → ALWAYS require Yes/No
    const expiresAt = now + RIDER_LOGIN_ALERT_TTL_MS;
    const alert = {
      sessionId,
      previousSessionId,
      deviceName,
      location,
      platform: platform || undefined,
      at: now,
      expiresAt,
      status: "pending" as const,
      resolved: false,
    };
    await db.patch(rider._id, { loginAlert: alert } as any);

    try {
      await scheduler.runAfter(RIDER_LOGIN_ALERT_TTL_MS, internal.riders.expireRiderLoginAlert, {
        email: String(rider.email),
        sessionId,
      });
    } catch { /* optional */ }

    if (rider.email) {
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(rider.email).toLowerCase(),
          title: "New login to your DKMerch rider account",
          body: `${deviceName} · ${location}. Confirm if this was you.`,
          url: "/rider?open=loginAlert",
        });
      } catch { /* push optional */ }
    }

    return {
      success: true,
      riderExists: true,
      rider: safeRider,
      sessionId,
      pendingApproval: true,
      expiresAt,
    };
  },
});

export const expireRiderLoginAlert = internalMutation({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    const sid = String(sessionId || "").trim();
    const alert = (rider as any).loginAlert;
    if (!alert || String(alert.sessionId) !== sid) return { success: true, skipped: true };
    if (alert.resolved || alert.status !== "pending") return { success: true, skipped: true };
    await db.patch(rider._id, {
      loginAlert: { ...alert, status: "denied", resolved: true },
    } as any);
    return { success: true, denied: true };
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
    const ids = getRiderSessionIds(rider);
    if (ids.length === 0) return { valid: true, reason: "legacy" };

    const sid = String(sessionId || "").trim();
    const isValid = ids.includes(sid);
    return {
      valid: isValid,
      reason: isValid ? "ok" : "new_device_logged_in",
      activeDeviceAt: rider.activeDeviceAt,
      kickedAt: rider.kickedAt ?? null,
    };
  },
});

export const getPendingRiderLoginAlert = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return null;
    const alert = (rider as any).loginAlert;
    if (!alert || alert.resolved || alert.status !== "pending") return null;
    if (isRiderLoginAlertExpired(alert)) return null;
    return alert;
  },
});

export const getRiderLoginApprovalStatus = query({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const sid = String(sessionId || "").trim();
    if (!sid) return { status: "missing" as const };
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { status: "missing" as const };
    const alert = (rider as any).loginAlert;
    if (alert && String(alert.sessionId) === sid) {
      let st = alert.status || (alert.resolved ? "approved" : "pending");
      if (st === "pending" && isRiderLoginAlertExpired(alert)) st = "denied";
      return {
        status: st,
        deviceName: alert.deviceName,
        location: alert.location,
        at: alert.at,
        expiresAt: alert.expiresAt ?? ((Number(alert.at) || 0) + RIDER_LOGIN_ALERT_TTL_MS),
      };
    }
    if (getRiderSessionIds(rider).includes(sid)) {
      return { status: "approved" as const };
    }
    return { status: "denied" as const };
  },
});

export const confirmRiderLoginAlert = mutation({
  args: {
    email: v.string(),
    sessionId: v.string(),
    keepSessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { email, sessionId, keepSessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false, message: "Account not found." };
    const alert = (rider as any).loginAlert;
    if (!alert || String(alert.sessionId) !== String(sessionId)) {
      return { success: false, message: "No pending login found." };
    }
    if (alert.status !== "pending" || alert.resolved) {
      return { success: false, message: "This login request already ended." };
    }
    if (isRiderLoginAlertExpired(alert)) {
      await db.patch(rider._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
      } as any);
      return { success: false, message: "Login request timed out." };
    }
    const newId = String(alert.sessionId);
    const prevId = String(keepSessionId || alert.previousSessionId || "").trim();
    const ids = getRiderSessionIds(rider);
    if (prevId && !ids.includes(prevId)) ids.push(prevId);
    if (newId && !ids.includes(newId)) ids.push(newId);
    await db.patch(rider._id, {
      activeSessionId: prevId || newId,
      activeSessionIds: [...new Set(ids.filter(Boolean))],
      activeDeviceAt: Date.now(),
      activeDeviceName: (rider as any).activeDeviceName || alert.deviceName,
      activeDeviceLocation: (rider as any).activeDeviceLocation || alert.location,
      activeDevicePlatform: (rider as any).activeDevicePlatform || alert.platform,
      kickedAt: undefined,
      loginAlert: { ...alert, status: "approved", resolved: true },
    } as any);
    return { success: true };
  },
});

export const denyRiderLoginAlert = mutation({
  args: {
    email: v.string(),
    newSessionId: v.string(),
  },
  handler: async ({ db, scheduler }, { email, newSessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false, message: "Account not found." };
    const alert = (rider as any).loginAlert;
    const neu = String(newSessionId || "").trim();
    if (!neu) return { success: false, message: "Invalid session." };
    if (alert && String(alert.sessionId) === neu) {
      await db.patch(rider._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
      } as any);
    }
    if (rider.email) {
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(rider.email).toLowerCase(),
          title: "Login blocked",
          body: "A rider login attempt was denied. If this wasn't you, change your password.",
          url: "/rider",
        });
      } catch { /* optional */ }
    }
    return { success: true, revoked: true };
  },
});

export const cancelPendingRiderLogin = mutation({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    const sid = String(sessionId || "").trim();
    const alert = (rider as any).loginAlert;
    if (alert && String(alert.sessionId) === sid) {
      await db.patch(rider._id, {
        loginAlert: undefined,
        activeDeviceAt: 0,
      } as any);
    } else {
      await db.patch(rider._id, {
        loginAlert: undefined,
        activeDeviceAt: 0,
      } as any);
    }
    return { success: true };
  },
});

export const touchRiderSession = mutation({
  args: {
    email: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    const sid = String(sessionId || "").trim();
    const ids = getRiderSessionIds(rider);
    const now = Date.now();
    if (sid && ids.includes(sid)) {
      await db.patch(rider._id, { activeDeviceAt: now } as any);
      return { success: true, sessionId: sid };
    }
    if (ids.length > 0) {
      const primary = ids[0];
      await db.patch(rider._id, {
        activeDeviceAt: now,
        activeSessionId: primary,
        activeSessionIds: ids,
      } as any);
      return { success: true, sessionId: primary, rebound: true };
    }
    return { success: false };
  },
});

export const endRiderSession = mutation({
  args: {
    email: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    const sid = String(sessionId || "").trim();
    const ids = getRiderSessionIds(rider);
    if (sid) {
      if (!ids.includes(sid)) return { success: true, cleared: false };
      const remaining = ids.filter((s) => s !== sid);
      if (remaining.length === 0) {
        await db.patch(rider._id, {
          activeSessionId: undefined,
          activeSessionIds: undefined,
          activeDeviceAt: undefined,
          loginAlert: undefined,
        } as any);
      } else {
        await db.patch(rider._id, {
          activeSessionId: remaining[0],
          activeSessionIds: remaining,
        } as any);
      }
      return { success: true, cleared: true };
    }
    await db.patch(rider._id, {
      activeSessionId: undefined,
      activeSessionIds: undefined,
      activeDeviceAt: undefined,
      loginAlert: undefined,
    } as any);
    return { success: true, cleared: true };
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
      patch.lastKnownLat = args.lat;
      patch.lastKnownLng = args.lng;
      patch.lastKnownAt = now;
      // Keep previous address unless a new one is provided (GPS ticks often omit it)
      if (args.lastKnownAddress) {
        patch.lastKnownAddress = args.lastKnownAddress;
      }
    }

    if (existing) {
      await db.patch(existing._id, patch);
    } else {
      await db.insert("riderLocations", {
        orderId:    args.orderId,
        riderEmail: args.riderEmail,
        riderName:  args.riderName,
        lastKnownAddress: args.lastKnownAddress ?? null,
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
  args: {
    orderId: v.optional(v.string()),
    orderIds: v.optional(v.array(v.string())),
  },
  handler: async ({ db }, { orderId, orderIds }) => {
    const ids = [...new Set([...(orderIds || []), orderId].filter(Boolean).map(String))];
    const now = Date.now();
    for (const id of ids) {
      const existing = await db
        .query("riderLocations")
        .withIndex("by_orderId", q => q.eq("orderId", id))
        .first();
      if (existing) {
        await db.patch(existing._id, { isTracking: false, updatedAt: now });
      }
    }
    return { success: true, count: ids.length };
  },
});

/** Push the same GPS fix to every active Out-for-Delivery order for this rider. */
export const updateRiderLocationsBatch = mutation({
  args: {
    orderIds: v.array(v.string()),
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
    const now = Date.now();
    const isRealPosition = args.lat !== 0 && args.lng !== 0;
    for (const orderId of args.orderIds) {
      const existing = await db
        .query("riderLocations")
        .withIndex("by_orderId", q => q.eq("orderId", orderId))
        .first();
      const patch: any = {
        lat: args.lat,
        lng: args.lng,
        accuracy: args.accuracy,
        heading: args.heading,
        speed: args.speed,
        isTracking: args.isTracking,
        updatedAt: now,
        sessionId: args.sessionId,
        riderEmail: args.riderEmail,
        riderName: args.riderName,
      };
      if (isRealPosition) {
        patch.lastKnownLat = args.lat;
        patch.lastKnownLng = args.lng;
        patch.lastKnownAt = now;
        if (args.lastKnownAddress) {
          patch.lastKnownAddress = args.lastKnownAddress;
        }
      }
      if (existing) await db.patch(existing._id, patch);
      else {
        await db.insert("riderLocations", {
          orderId,
          riderEmail: args.riderEmail,
          riderName: args.riderName,
          lastKnownAddress: args.lastKnownAddress ?? null,
          ...patch,
        });
      }
    }
    return { success: true, count: args.orderIds.length };
  },
});

/**
 * Rider GPS turned off (manual or stop) — mark locations offline and alert
 * admin + each affected customer by email.
 */
export const stopRiderTrackingWithAlert = mutation({
  args: {
    orderIds: v.array(v.string()),
    riderName: v.string(),
    riderEmail: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { orderIds, riderName, riderEmail, reason }) => {
    const ids = [...new Set(orderIds.filter(Boolean))];
    const now = Date.now();
    const reasonText = reason || "Rider turned off live location sharing";

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

    for (const orderId of ids) {
      const loc = await db
        .query("riderLocations")
        .withIndex("by_orderId", q => q.eq("orderId", orderId))
        .first();
      if (loc) {
        await db.patch(loc._id, { isTracking: false, updatedAt: now });
      }

      const order = await db
        .query("orders")
        .withIndex("by_orderId", q => q.eq("orderId", orderId))
        .first();

      const shortId = String(orderId).slice(-8).toUpperCase();
      const adminMsg = `📴 ${riderName} turned off GPS for order #${shortId}. ${reasonText}. Last known pin stays on the map.`;

      await db.insert("riderNotifications", {
        type: "rider_gps_off",
        orderId,
        customerName: order?.customerName || "Customer",
        total: order?.finalTotal ?? order?.total ?? 0,
        message: adminMsg,
        createdAt: new Date(now).toISOString(),
        read: false,
      });

      const customerTo = order?.email;
      if (customerTo) {
        await scheduler.runAfter(0, internal.sendEmail.sendEmail, {
          to: customerTo,
          subject: `📴 Rider location paused — Order #${shortId} | DKMerch`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px;">
            <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
              <h2 style="color:#fc1268;margin:0 0 12px;">DKMerch</h2>
              <p>Hi <strong>${order?.customerName || "Customer"}</strong>,</p>
              <p>Your rider <strong>${riderName}</strong> turned off live location for order <strong>#${shortId}</strong>.</p>
              <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;color:#9a3412;">
                ${reasonText}. The map will keep showing their <strong>last known location</strong> until they share again or delivery is completed.
              </p>
              <p><a href="https://dkmerchwebsite.vercel.app/track-order?order=${encodeURIComponent(orderId)}" style="color:#fc1268;font-weight:700;">Open Track Order</a></p>
            </div></body></html>`,
        });
      }

      for (const adminTo of adminEmails) {
        await scheduler.runAfter(0, internal.sendEmail.sendEmail, {
          to: adminTo,
          subject: `⚠️ Rider GPS OFF — #${shortId} · ${riderName}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f5;padding:24px;">
            <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
              <h2 style="color:#fc1268;margin:0 0 12px;">DKMerch Admin</h2>
              <p><strong>${riderName}</strong>${riderEmail ? ` (${riderEmail})` : ""} turned off live GPS.</p>
              <p>Order: <strong>#${shortId}</strong> · Customer: <strong>${order?.customerName || "—"}</strong></p>
              <p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;color:#9a3412;">${reasonText}</p>
              <p>Last known location remains on the admin / track maps.</p>
            </div></body></html>`,
        });
      }
    }

    return { success: true, count: ids.length, riderEmail: riderEmail || null };
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