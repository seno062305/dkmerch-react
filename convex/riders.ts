// convex/riders.ts
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const genSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

/** Yes/No window — resets on every new login request */
const RIDER_LOGIN_ALERT_TTL_MS = 2 * 60 * 1000;
const RIDER_LOGIN_BROADCAST_TTL_MS = 10 * 60 * 1000;

function makeRiderLoginBroadcast(
  kind: "request" | "opened" | "blocked",
  alert: { sessionId?: string; deviceName?: string; location?: string },
  now = Date.now(),
) {
  return {
    kind,
    sessionId: String(alert?.sessionId || ""),
    deviceName: String(alert?.deviceName || "Another device"),
    location: alert?.location ? String(alert.location) : undefined,
    at: now,
  };
}
/** Notify admin once when rider GPS is within this distance of the customer pin. */
const ARRIVAL_GEOFENCE_KM = 0.12; // ~120 meters

function isRiderLoginAlertExpired(alert: any, now = Date.now()) {
  if (!alert) return true;
  const expiresAt = Number(alert.expiresAt) || (Number(alert.at) || 0) + RIDER_LOGIN_ALERT_TTL_MS;
  return expiresAt > 0 && now >= expiresAt;
}

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

/** One-shot admin bell: rider reached customer location (proof of attempt). */
async function maybeNotifyAdminRiderArrived(
  db: any,
  args: {
    orderId: string;
    riderName: string;
    lat: number;
    lng: number;
    arrivedNotifiedAt?: number | null;
  }
) {
  if (args.arrivedNotifiedAt) return false;
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng) || args.lat === 0 || args.lng === 0) {
    return false;
  }
  const order = await db
    .query("orders")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", args.orderId))
    .first();
  if (!order) return false;
  const destLat = Number(order.addressLat);
  const destLng = Number(order.addressLng);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || destLat === 0 || destLng === 0) {
    return false;
  }
  const km = haversineKm(args.lat, args.lng, destLat, destLng);
  if (km > ARRIVAL_GEOFENCE_KM) return false;

  const shortId = String(args.orderId).slice(-8).toUpperCase();
  const customer = order.customerName || "Customer";
  await db.insert("riderNotifications", {
    type: "rider_at_customer",
    orderId: String(args.orderId),
    customerName: String(customer),
    total: Number(order.finalTotal ?? order.total ?? 0),
    message:
      `🛵 ${args.riderName || "Rider"} is at ${customer}'s location (Order #${shortId}). ` +
      `Proof of arrival — customer may not be answering the call.`,
    createdAt: new Date().toISOString(),
    read: false,
  });
  return true;
}

// ── Generate DKMerch Rider ID: DKR-YYYY-XXXX ──
const generateDkRiderId = (sequence: number, year = new Date().getFullYear()): string => {
  const seq = String(sequence).padStart(4, '0');
  return `DKR-${year}-${seq}`;
};

/** Parse DKR-YYYY-NNNN → { year, seq } or null. */
function parseDkRiderId(id: string | undefined | null): { year: number; seq: number } | null {
  const m = String(id || '').trim().match(/^DKR-(\d{4})-(\d+)$/i);
  if (!m) return null;
  return { year: Number(m[1]), seq: Number(m[2]) };
}

/** Next unique ID based on max existing sequence for the current year (not count). */
async function allocateNextDkRiderId(db: any): Promise<string> {
  const year = new Date().getFullYear();
  const allRiders = await db.query("riderApplications").collect();
  let maxSeq = 0;
  const used = new Set<string>();
  for (const r of allRiders) {
    const id = String(r.dkRiderId || '').trim().toUpperCase();
    if (!id) continue;
    used.add(id);
    const parsed = parseDkRiderId(id);
    if (parsed && parsed.year === year && parsed.seq > maxSeq) maxSeq = parsed.seq;
  }
  let next = maxSeq + 1;
  let candidate = generateDkRiderId(next, year);
  while (used.has(candidate)) {
    next += 1;
    candidate = generateDkRiderId(next, year);
  }
  return candidate;
}

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
    const email = String(args.email || "").trim().toLowerCase();
    const verified = await assertRiderEmailVerified(db, email);
    if (!verified.ok) return { success: false, message: verified.message };

    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (existing) {
      return { success: false, message: "This email is already registered as a rider applicant." };
    }
    const id = await db.insert("riderApplications", {
      fullName: args.fullName,
      email,
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
    if (verified.row?._id) {
      try { await db.delete(verified.row._id); } catch { /* optional */ }
    }
    return { success: true, id };
  },
});

export const approveRider = mutation({
  args: { id: v.id("riderApplications") },
  handler: async ({ db }, { id }) => {
    const rider = await db.get(id);
    if (!rider) throw new Error("Rider not found");
    // Keep existing unique ID if already assigned
    if (rider.dkRiderId) {
      await db.patch(id, { status: "approved" });
      return { success: true, dkRiderId: rider.dkRiderId };
    }
    const dkRiderId = await allocateNextDkRiderId(db);
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
    const verified = await assertRiderEmailVerified(db, email);
    if (!verified.ok) return { success: false, message: verified.message };

    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (existing) {
      return { success: false, message: "A rider with this email already exists." };
    }

    const dkRiderId = await allocateNextDkRiderId(db);

    // Never pass explicit `undefined` — Convex rejects those on insert.
    const doc: Record<string, unknown> = {
      fullName: args.fullName.trim(),
      email,
      phone: args.phone.trim(),
      vehicleType: args.vehicleType || "motorcycle",
      password: args.password,
      status: "approved",
      appliedAt: new Date().toISOString(),
      dkRiderId,
      dkRiderIdGeneratedAt: new Date().toISOString(),
      activeSessionIds: [] as string[],
    };
    const address = args.address?.trim();
    const plateNumber = args.plateNumber?.trim();
    const licenseNumber = args.licenseNumber?.trim();
    const riderPhoto = args.riderPhoto || null;
    if (address) doc.address = address;
    if (plateNumber) doc.plateNumber = plateNumber;
    if (licenseNumber) doc.licenseNumber = licenseNumber;
    if (riderPhoto) {
      // Soft guard — Convex docs max ~1MB; huge data-URLs fail the whole create
      if (String(riderPhoto).length > 900_000) {
        return {
          success: false,
          message: "Rider photo is too large. Please upload a smaller JPG/PNG (under ~500KB).",
        };
      }
      doc.riderPhoto = riderPhoto;
    }

    const id = await db.insert("riderApplications", doc as any);

    if (verified.row?._id) {
      try { await db.delete(verified.row._id); } catch { /* optional */ }
    }

    return { success: true, id, dkRiderId, email, fullName: args.fullName.trim() };
  },
});

/** Fix duplicate / missing rider IDs (safe to call repeatedly). */
export const repairDuplicateRiderIds = mutation({
  args: {},
  handler: async ({ db }) => {
    const year = new Date().getFullYear();
    const riders = await db.query("riderApplications").collect();
    riders.sort((a: any, b: any) => {
      const ta = Date.parse(a.appliedAt || a.dkRiderIdGeneratedAt || "") || a._creationTime || 0;
      const tb = Date.parse(b.appliedAt || b.dkRiderIdGeneratedAt || "") || b._creationTime || 0;
      return ta - tb;
    });

    const used = new Set<string>();
    let maxSeq = 0;
    let fixed = 0;

    // First pass: keep first occurrence of each ID, clear duplicates
    for (const r of riders) {
      const id = String(r.dkRiderId || "").trim().toUpperCase();
      if (!id) continue;
      if (used.has(id)) {
        await db.patch(r._id, { dkRiderId: undefined });
        (r as any).dkRiderId = undefined;
        fixed += 1;
        continue;
      }
      used.add(id);
      const parsed = parseDkRiderId(id);
      if (parsed && parsed.year === year && parsed.seq > maxSeq) maxSeq = parsed.seq;
    }

    // Second pass: assign IDs to anyone missing one (approved or previously duplicated)
    for (const r of riders) {
      if (r.dkRiderId) continue;
      // Only assign to approved / active riders (or anyone that had an ID cleared)
      if (r.status !== "approved" && r.status !== "active") continue;
      let next = maxSeq + 1;
      let candidate = generateDkRiderId(next, year);
      while (used.has(candidate)) {
        next += 1;
        candidate = generateDkRiderId(next, year);
      }
      used.add(candidate);
      maxSeq = next;
      await db.patch(r._id, {
        dkRiderId: candidate,
        dkRiderIdGeneratedAt: new Date().toISOString(),
      });
      fixed += 1;
    }

    return { success: true, fixed };
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

/**
 * Mobile browsers pause heartbeats in background — keep a wide window so
 * another-device login still shows Yes/No instead of silent auto-logout.
 */
const RIDER_SESSION_ACTIVE_MS = 15 * 60 * 1000;

function hasLiveRiderSession(rider: any, now = Date.now()): boolean {
  const ids = getRiderSessionIds(rider);
  if (ids.length === 0) return false;
  const at = Number(rider?.activeDeviceAt) || 0;
  // Sessions exist but never heartbeated yet → still treat as open (gate Yes/No)
  if (!at) return true;
  return now - at < RIDER_SESSION_ACTIVE_MS;
}

function clearRiderLoginGatePatch() {
  return {
    loginAlert: undefined,
    loginBroadcast: undefined,
    activeSessionId: undefined,
    activeSessionIds: [] as string[],
    activeDeviceAt: undefined,
  };
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
    loginBroadcast: undefined,
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
    const otherDeviceLive = hasLiveRiderSession(rider, now);
    const STUCK_PENDING_MS = 2 * 60 * 1000;
    const pendingAlert = (rider as any).loginAlert;
    const pendingAge = pendingAlert?.at ? now - Number(pendingAlert.at) : 0;
    const pendingOpen =
      pendingAlert
      && pendingAlert.status === "pending"
      && !pendingAlert.resolved
      && !isRiderLoginAlertExpired(pendingAlert, now);
    const stuckPending = pendingOpen && pendingAge > STUCK_PENDING_MS;
    const pendingTimedOutOrDenied =
      !!pendingAlert
      && (
        pendingAlert.status === "denied"
        || isRiderLoginAlertExpired(pendingAlert, now)
        || (pendingAlert.resolved && pendingAlert.status !== "approved")
      );

    // Direct login when: no live other device, stuck wait, or prior Yes/No expired/denied
    if (!otherDeviceLive || stuckPending || pendingTimedOutOrDenied) {
      const hadOtherSessions = existingIds.length > 0;
      await db.patch(rider._id, {
        ...activateRiderSessionPatch(sessionId, now, deviceName, location, platform),
        ...(hadOtherSessions
          ? {
              loginBroadcast: makeRiderLoginBroadcast(
                "opened",
                { sessionId, deviceName, location },
                now,
              ),
              kickedAt: now,
            }
          : { loginBroadcast: undefined }),
      } as any);
      return {
        success: true,
        riderExists: true,
        rider: safeRider,
        sessionId,
        pendingApproval: false,
        tookOver: hadOtherSessions,
      };
    }

    // Active pending + live owner device → keep waiting (refresh countdown)
    if (pendingOpen) {
      const expiresAt = now + RIDER_LOGIN_ALERT_TTL_MS;
      const alert = {
        sessionId: String(pendingAlert.sessionId || sessionId),
        previousSessionId: previousSessionId || String(pendingAlert.previousSessionId || ""),
        deviceName: deviceName || pendingAlert.deviceName,
        location: location || pendingAlert.location,
        platform: platform || pendingAlert.platform || undefined,
        at: Number(pendingAlert.at) || now,
        expiresAt,
        status: "pending" as const,
        resolved: false,
      };
      await db.patch(rider._id, {
        loginAlert: alert,
        loginBroadcast: makeRiderLoginBroadcast("request", alert, now),
      } as any);
      return {
        success: true,
        riderExists: true,
        rider: safeRider,
        sessionId: String(alert.sessionId),
        pendingApproval: true,
        expiresAt,
      };
    }

    // Another device is truly live → require Yes/No once
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
    await db.patch(rider._id, {
      loginAlert: alert,
      loginBroadcast: makeRiderLoginBroadcast("request", alert, now),
    } as any);

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
          role: "rider",
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
      loginBroadcast: makeRiderLoginBroadcast("blocked", alert),
      // Keep owner heartbeat — do not clear activeDeviceAt
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
    if (ids.includes(sid)) {
      return {
        valid: true,
        reason: "ok",
        activeDeviceAt: rider.activeDeviceAt ?? null,
        activeDeviceName: rider.activeDeviceName ?? null,
        activeDeviceLocation: rider.activeDeviceLocation ?? null,
        kickedAt: rider.kickedAt ?? null,
      };
    }

    // Owner stays signed in while Yes/No is pending
    const alert = (rider as any).loginAlert;
    if (
      alert
      && alert.status === "pending"
      && !alert.resolved
      && !isRiderLoginAlertExpired(alert)
      && (
        String(alert.previousSessionId || "") === sid
        || ids.includes(sid)
      )
    ) {
      return {
        valid: true,
        reason: "pending_approval",
        activeDeviceAt: rider.activeDeviceAt ?? null,
        activeDeviceName: rider.activeDeviceName ?? null,
        activeDeviceLocation: rider.activeDeviceLocation ?? null,
        kickedAt: rider.kickedAt ?? null,
      };
    }

    return {
      valid: false,
      reason: "new_device_logged_in",
      activeDeviceAt: rider.activeDeviceAt ?? null,
      activeDeviceName: rider.activeDeviceName ?? null,
      activeDeviceLocation: rider.activeDeviceLocation ?? null,
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

/** Fan-out sign-in notice for every rider device on this account. */
export const getRiderLoginBroadcast = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!rider) return null;
    const b = (rider as any).loginBroadcast;
    if (!b?.at || !b?.kind) return null;
    if (Date.now() - Number(b.at) > RIDER_LOGIN_BROADCAST_TTL_MS) return null;
    return b;
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
        loginBroadcast: makeRiderLoginBroadcast("blocked", alert),
      } as any);
      return { success: false, message: "Login request timed out." };
    }
    const newId = String(alert.sessionId);
    const prevId = String(keepSessionId || alert.previousSessionId || "").trim();
    const ids = getRiderSessionIds(rider);
    if (prevId && !ids.includes(prevId)) ids.push(prevId);
    if (newId && !ids.includes(newId)) ids.push(newId);
    const now = Date.now();
    await db.patch(rider._id, {
      activeSessionId: prevId || newId,
      activeSessionIds: [...new Set(ids.filter(Boolean))],
      activeDeviceAt: now,
      activeDeviceName: (rider as any).activeDeviceName || alert.deviceName,
      activeDeviceLocation: (rider as any).activeDeviceLocation || alert.location,
      activeDevicePlatform: (rider as any).activeDevicePlatform || alert.platform,
      kickedAt: undefined,
      loginAlert: { ...alert, status: "approved", resolved: true },
      loginBroadcast: makeRiderLoginBroadcast("opened", alert, now),
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
    const now = Date.now();
    if (alert && String(alert.sessionId) === neu) {
      await db.patch(rider._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
        loginBroadcast: makeRiderLoginBroadcast("blocked", alert, now),
      } as any);
    }
    if (rider.email) {
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(rider.email).toLowerCase(),
          title: "Login blocked",
          body: "A rider login attempt was denied. If this wasn't you, change your password.",
          url: "/rider",
          role: "rider",
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
    void sessionId;
    // Clear gate completely so the next login opens directly (no ghost wait loop)
    await db.patch(rider._id, clearRiderLoginGatePatch() as any);
    return { success: true };
  },
});

/** Emergency unlock — clear Yes/No gate so rider can log in again. */
export const clearRiderLoginGate = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", String(email || "").trim().toLowerCase()))
      .first();
    if (!rider) return { success: false, message: "Rider not found." };
    await db.patch(rider._id, clearRiderLoginGatePatch() as any);
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

    let locId = existing?._id;
    if (existing) {
      await db.patch(existing._id, patch);
    } else {
      locId = await db.insert("riderLocations", {
        orderId:    args.orderId,
        riderEmail: args.riderEmail,
        riderName:  args.riderName,
        lastKnownAddress: args.lastKnownAddress ?? null,
        ...patch,
      });
    }

    if (isRealPosition && locId) {
      const notified = await maybeNotifyAdminRiderArrived(db, {
        orderId: args.orderId,
        riderName: args.riderName,
        lat: args.lat,
        lng: args.lng,
        arrivedNotifiedAt: existing?.arrivedNotifiedAt,
      });
      if (notified) {
        await db.patch(locId, { arrivedNotifiedAt: now });
      }
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
      let locId = existing?._id;
      if (existing) await db.patch(existing._id, patch);
      else {
        locId = await db.insert("riderLocations", {
          orderId,
          riderEmail: args.riderEmail,
          riderName: args.riderName,
          lastKnownAddress: args.lastKnownAddress ?? null,
          ...patch,
        });
      }
      if (isRealPosition && locId) {
        const notified = await maybeNotifyAdminRiderArrived(db, {
          orderId,
          riderName: args.riderName,
          lat: args.lat,
          lng: args.lng,
          arrivedNotifiedAt: existing?.arrivedNotifiedAt,
        });
        if (notified) {
          await db.patch(locId, { arrivedNotifiedAt: now });
        }
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
// Rider application email OTP (verify inbox before apply / admin create)
// ─────────────────────────────────────────────────────────────────────────────

const RIDER_OTP_TTL_MS = 3 * 60 * 1000;
const RIDER_OTP_VERIFIED_TTL_MS = 30 * 60 * 1000;

async function assertRiderEmailVerified(db: any, email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  const row = await db
    .query("pendingRiderOtps")
    .withIndex("by_email", (q: any) => q.eq("email", normalized))
    .first();
  if (!row?.verified || !row.verifiedAt) {
    return { ok: false as const, message: "Please verify the email with the OTP code first." };
  }
  if (Date.now() - Number(row.verifiedAt) > RIDER_OTP_VERIFIED_TTL_MS) {
    return { ok: false as const, message: "Email verification expired. Send a new OTP." };
  }
  return { ok: true as const, row };
}

/** Generate OTP for rider email — client then emails it via sendRegistrationOTP. */
export const requestRiderEmailOtp = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
  },
  handler: async ({ db }, { email, name }) => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { success: false, message: "Enter a valid email address." };
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();
    const existing = await db
      .query("pendingRiderOtps")
      .withIndex("by_email", (q: any) => q.eq("email", normalized))
      .first();
    if (existing) {
      await db.patch(existing._id, {
        otp,
        otpExpiresAt: now + RIDER_OTP_TTL_MS,
        verified: false,
        verifiedAt: undefined,
        name: name || existing.name,
        createdAt: now,
      });
    } else {
      await db.insert("pendingRiderOtps", {
        email: normalized,
        name: name || undefined,
        otp,
        otpExpiresAt: now + RIDER_OTP_TTL_MS,
        verified: false,
        createdAt: now,
      });
    }
    return { success: true, otp, email: normalized };
  },
});

export const verifyRiderEmailOtp = mutation({
  args: {
    email: v.string(),
    otp: v.string(),
  },
  handler: async ({ db }, { email, otp }) => {
    const normalized = String(email || "").trim().toLowerCase();
    const code = String(otp || "").trim();
    const row = await db
      .query("pendingRiderOtps")
      .withIndex("by_email", (q: any) => q.eq("email", normalized))
      .first();
    if (!row) return { success: false, message: "No OTP found. Please send a new code." };
    if (Date.now() > Number(row.otpExpiresAt)) {
      return { success: false, message: "OTP expired. Please send a new code.", expired: true };
    }
    if (String(row.otp) !== code) {
      return { success: false, message: "Incorrect OTP. Please try again." };
    }
    await db.patch(row._id, { verified: true, verifiedAt: Date.now() });
    return { success: true };
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