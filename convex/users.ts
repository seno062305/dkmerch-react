// convex/users.ts
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { insertCustomerNotification } from "./customerNotifications";

// ── RATE LIMIT CONFIG ─────────────────────────────
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_MAX        = 5;             // max 5 attempts per fingerprint per 2 mins

/** 30-day grace window after customer self-delete (recoverable via OTP). */
const ACCOUNT_DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

function genSessionId() {
  const a = Math.random().toString(36).slice(2, 10);
  const b = Math.random().toString(36).slice(2, 10);
  return `us_${Date.now().toString(36)}_${a}${b}`.toUpperCase();
}

// ── QUERIES ──────────────────────────────────────

export const getAllUsers = query(async ({ db }) => {
  return await db.query("users").order("desc").collect();
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const trimmed = String(email || "").trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    const exact = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", trimmed))
      .first();
    if (exact) return exact;
    if (trimmed !== normalized) {
      return await db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .first();
    }
    return await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
  },
});

export const getUserByUsername = query({
  args: { username: v.string() },
  handler: async ({ db }, { username }) => {
    return await db.query("users").withIndex("by_username", q => q.eq("username", username)).first();
  },
});

export const getUserById = query({
  args: { id: v.id("users") },
  handler: async ({ db }, { id }) => {
    return await db.get(id);
  },
});

export const getPendingUsers = query(async ({ db }) => {
  const users = await db.query("users").order("desc").collect();
  return users.filter(u => u.status === "pending_activation");
});

export const getProfile = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    try {
      const user = await db.get(userId as any) as any;
      if (user) return {
        fullName: user.fullName || user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        barangay: user.barangay || '',
        city: user.city || '',
        zipCode: user.zipCode || '',
        addressLat: user.addressLat || null,
        addressLng: user.addressLng || null,
      };
    } catch {}
    return null;
  },
});

export const getAllUsersForPromoNotif = internalQuery({
  args: {},
  handler: async ({ db }) => {
    const users = await db.query("users").collect();
    return users
      .filter(u => u.email && u.role !== "admin")
      .map(u => ({ name: u.name ?? u.fullName ?? "there", email: u.email }));
  },
});

// ── MUTATIONS ─────────────────────────────────────

export const loginUser = mutation({
  args: { identifier: v.string(), password: v.string() },
  handler: async ({ db }, { identifier, password }) => {
    const raw = String(identifier || "").trim();
    const normalized = raw.toLowerCase();

    const byEmail = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", raw))
      .first();

    const byEmailLower =
      !byEmail && raw !== normalized
        ? await db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", normalized))
            .first()
        : null;

    const byUsername = await db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", raw))
      .first();

    const byUsernameLower =
      !byUsername && raw !== normalized
        ? await db
            .query("users")
            .withIndex("by_username", (q) => q.eq("username", normalized))
            .first()
        : null;

    let user = byEmail || byEmailLower || byUsername || byUsernameLower;

    if (user && user.password === password) {
      // ── Auto-unsuspend if suspension has expired ──
      if (user.status === "suspended" && user.suspendedUntil) {
        if (Date.now() >= user.suspendedUntil) {
          await db.patch(user._id, {
            status: "active",
            suspendedUntil: undefined,
            suspendedAt: undefined,
            suspendReason: undefined,
            suspendNote: undefined,
          });
          user = { ...user, status: "active" };
        }
      }

      if (user.status === "suspended") {
        const isPermanent = !user.suspendedUntil;
        const until = user.suspendedUntil
          ? new Date(user.suspendedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : null;
        const msg = isPermanent
          ? "Your account has been permanently suspended. Please contact support."
          : `Your account is suspended until ${until}. Please contact support.`;
        return { success: false, user: null, message: msg };
      }

      // ── Self-deactivated: prompt reactivation ──
      if (user.status === "self_deactivated") {
        return {
          success: false,
          user: null,
          message: "self_deactivated",
          deactivated: true,
          userEmail: user.email,
          userName: user.name,
        };
      }

      // ── Soft-deleted: recoverable within 30 days, then permanent ──
      if (user.status === "deleted") {
        const deletedAt = Number((user as any).deletedAt) || 0;
        const recoverUntil = deletedAt + ACCOUNT_DELETE_GRACE_MS;
        if (deletedAt > 0 && Date.now() < recoverUntil) {
          return {
            success: false,
            user: null,
            message: "account_deleted_recoverable",
            deleted: true,
            recoverable: true,
            userEmail: user.email,
            userName: user.name,
            deletedAt,
            recoverUntil,
          };
        }
        return {
          success: false,
          user: null,
          message: "This account has been permanently deleted and is no longer accessible.",
          deleted: true,
          recoverable: false,
        };
      }

      if (user.status === "pending_activation") {
        return { success: false, user: null, message: "Your account is pending activation by an administrator." };
      }

      const safeUser = {
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        usernameChangedAt: (user as any).usernameChangedAt ?? null,
      };

      // Admin + customer: password OK → PIN (or Create PIN) before session start
      const hasPin = !!(user as any).pin && String((user as any).pin).length >= 4;
      if (hasPin) {
        return { success: true, user: safeUser, needsPin: true };
      }
      // Legacy / first login without PIN → go straight to Create PIN (client)
      return { success: true, user: safeUser, needsPinSetup: true };
    }
    return { success: false, user: null, message: "Invalid username/email or password" };
  },
});

const PIN_RE = /^\d{4,6}$/;       // verify existing PINs
const PIN_SET_RE = /^\d{6}$/;     // new PINs must be exactly 6 digits

async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isPlainPin(value: unknown): value is string {
  return typeof value === "string" && PIN_RE.test(value);
}

const toSafeUser = (user: any) => ({
  _id: user._id,
  name: user.name,
  username: user.username,
  email: user.email,
  phone: user.phone || "",
  role: user.role,
  usernameChangedAt: user.usernameChangedAt ?? null,
});

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether this customer already has a login PIN (for post-update unlock routing). */
export const hasLoginPin = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const id = String(userId || "").trim();
    if (!id) return { hasPin: false, pinLength: 6 };
    try {
      const user = await db.get(id as any);
      if (!user) return { hasPin: false, pinLength: 6 };
      const pin = (user as any).pin;
      const hasPin = !!(pin && String(pin).length >= 4);
      const len = Number((user as any).pinLength);
      const pinLength = Number.isFinite(len) && len >= 4 && len <= 6 ? len : 6;
      return { hasPin, pinLength };
    } catch {
      return { hasPin: false, pinLength: 6 };
    }
  },
});

/** Pending Yes/No login request auto-denies after this (always 60s, even on re-request). */
const LOGIN_ALERT_TTL_MS = 60 * 1000;
/** How long other devices keep showing a fan-out sign-in toast. */
const LOGIN_BROADCAST_TTL_MS = 10 * 60 * 1000;

function isLoginAlertExpired(alert: any, now = Date.now()) {
  if (!alert) return true;
  const expiresAt = Number(alert.expiresAt) || (Number(alert.at) || 0) + LOGIN_ALERT_TTL_MS;
  return expiresAt > 0 && now >= expiresAt;
}

function makeLoginBroadcast(
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

function getActiveSessionIds(user: any): string[] {
  const fromArr = Array.isArray(user?.activeSessionIds)
    ? user.activeSessionIds.map((s: any) => String(s || "").trim()).filter(Boolean)
    : [];
  const primary = String(user?.activeSessionId || "").trim();
  if (primary && !fromArr.includes(primary)) return [primary, ...fromArr];
  return fromArr;
}

function activateSessionPatch(
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
    loginAlert: undefined,
  };
}

async function upsertUserSession(
  db: any,
  args: {
    userId: string;
    sessionId: string;
    deviceName?: string;
    location?: string;
    platform?: string;
    now?: number;
  }
) {
  const userId = String(args.userId || "").trim();
  const sessionId = String(args.sessionId || "").trim();
  if (!userId || !sessionId) return;
  const now = args.now || Date.now();
  const existing = await db
    .query("userSessions")
    .withIndex("by_user_session", (q: any) => q.eq("userId", userId).eq("sessionId", sessionId))
    .first();
  if (existing) {
    const patch: any = { lastActiveAt: now };
    if (args.deviceName) patch.deviceName = String(args.deviceName).slice(0, 120);
    if (args.location) patch.location = String(args.location).slice(0, 160);
    if (args.platform) patch.platform = String(args.platform).slice(0, 80);
    await db.patch(existing._id, patch);
    return existing._id;
  }
  return await db.insert("userSessions", {
    userId,
    sessionId,
    deviceName: String(args.deviceName || "Unknown device").slice(0, 120),
    location: String(args.location || "Unknown location").slice(0, 160),
    platform: args.platform ? String(args.platform).slice(0, 80) : undefined,
    createdAt: now,
    lastActiveAt: now,
  });
}

async function removeUserSession(db: any, userId: string, sessionId: string) {
  const uid = String(userId || "").trim();
  const sid = String(sessionId || "").trim();
  if (!uid || !sid) return;
  const row = await db
    .query("userSessions")
    .withIndex("by_user_session", (q: any) => q.eq("userId", uid).eq("sessionId", sid))
    .first();
  if (row) await db.delete(row._id);
}

async function removeAllUserSessions(db: any, userId: string, keepSessionId?: string) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const keep = String(keepSessionId || "").trim();
  const rows = await db
    .query("userSessions")
    .withIndex("by_user", (q: any) => q.eq("userId", uid))
    .collect();
  await Promise.all(
    rows
      .filter((r: any) => !keep || String(r.sessionId) !== keep)
      .map((r: any) => db.delete(r._id))
  );
}

/**
 * Start a session. Pending Yes/No only when another device is RECENTLY active.
 * Stale / same-device / same-session → activate immediately (no alert, no push).
 */
export const startUserSession = mutation({
  args: {
    userId: v.id("users"),
    deviceName: v.optional(v.string()),
    location: v.optional(v.string()),
    platform: v.optional(v.string()),
    /** Existing local session (PIN unlock) — refresh without Yes/No. */
    currentSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { db, scheduler } = ctx;
    const user = await db.get(args.userId) as any;
    if (!user) return { success: false, message: "Account not found." };

    const now = Date.now();
    const deviceName = String(args.deviceName || "Unknown device").slice(0, 120);
    const location = String(args.location || "Unknown location").slice(0, 160);
    const platform = String(args.platform || "").slice(0, 80);
    const existingIds = getActiveSessionIds(user);
    const previousSessionId = existingIds[0];
    const currentSessionId = String(args.currentSessionId || "").trim();

    // Same session already active (e.g. PIN unlock on this device) → refresh only
    if (currentSessionId && existingIds.includes(currentSessionId)) {
      const patch = activateSessionPatch(
        currentSessionId,
        now,
        deviceName,
        location,
        platform,
        existingIds,
      ) as any;
      // Keep pending Yes/No so after PIN (from push tap) the old device still sees the modal
      const pending = user.loginAlert;
      if (
        pending
        && pending.status === "pending"
        && !pending.resolved
        && !isLoginAlertExpired(pending, now)
      ) {
        delete patch.loginAlert;
      }
      await db.patch(args.userId, patch);
      await upsertUserSession(db, {
        userId: String(args.userId),
        sessionId: currentSessionId,
        deviceName,
        location,
        platform,
        now,
      });
      return { success: true, sessionId: currentSessionId, pendingApproval: false };
    }

    const sessionId = genSessionId();
    const USER_SESSION_ACTIVE_MS = 90 * 1000;
    const at = Number(user.activeDeviceAt) || 0;
    const otherDeviceLive = existingIds.length > 0 && at > 0 && (now - at) < USER_SESSION_ACTIVE_MS;
    const STUCK_PENDING_MS = 2 * 60 * 1000;
    const pendingAlert = user.loginAlert;
    const pendingAge = pendingAlert?.at ? now - Number(pendingAlert.at) : 0;
    const pendingOpen =
      pendingAlert
      && pendingAlert.status === "pending"
      && !pendingAlert.resolved
      && !isLoginAlertExpired(pendingAlert, now);
    const stuckPending = pendingOpen && pendingAge > STUCK_PENDING_MS;
    const pendingTimedOutOrDenied =
      !!pendingAlert
      && (
        pendingAlert.status === "denied"
        || isLoginAlertExpired(pendingAlert, now)
        || (pendingAlert.resolved && pendingAlert.status !== "approved")
      );

    // First login / no live other device / stuck or expired Yes/No → take over
    if (!otherDeviceLive || stuckPending || pendingTimedOutOrDenied) {
      await db.patch(
        args.userId,
        activateSessionPatch(sessionId, now, deviceName, location, platform) as any,
      );
      await upsertUserSession(db, {
        userId: String(args.userId),
        sessionId,
        deviceName,
        location,
        platform,
        now,
      });
      return { success: true, sessionId, pendingApproval: false };
    }

    // Active pending request → keep waiting; refresh details + always reset 60s countdown
    if (pendingOpen) {
      const expiresAt = now + LOGIN_ALERT_TTL_MS;
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
      await db.patch(args.userId, {
        loginAlert: alert,
        loginBroadcast: makeLoginBroadcast("request", alert, now),
      } as any);
      try {
        await scheduler.runAfter(LOGIN_ALERT_TTL_MS, internal.users.expireLoginAlert, {
          userId: String(args.userId),
          sessionId: String(alert.sessionId),
        });
      } catch { /* optional */ }
      return {
        success: true,
        sessionId: String(alert.sessionId),
        pendingApproval: true,
        replacedSession: true,
        expiresAt,
      };
    }

    // Another device still has a session → ALWAYS require Yes/No (all roles)
    const expiresAt = now + LOGIN_ALERT_TTL_MS;
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
    // Keep ALL owner sessions intact — notice fans out to every logged-in device
    await db.patch(args.userId, {
      loginAlert: alert,
      loginBroadcast: makeLoginBroadcast("request", alert, now),
      activeSessionId: previousSessionId,
      activeSessionIds: existingIds,
      // Don't refresh activeDeviceAt from the NEW device — owner stays "primary"
    } as any);

    try {
      await scheduler.runAfter(LOGIN_ALERT_TTL_MS, internal.users.expireLoginAlert, {
        userId: String(args.userId),
        sessionId,
      });
    } catch { /* optional */ }

    if (user.email) {
      try {
        await insertCustomerNotification(db, {
          email: String(user.email),
          type: "login_alert",
          title: "New sign-in request",
          body: `${deviceName} · ${location}. Confirm on any logged-in device if this was you.`,
          url: "/?open=loginAlert",
        });
      } catch { /* optional */ }
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(user.email).toLowerCase(),
          title: "New login to your DKMerch account",
          body: `${deviceName} · ${location}. Confirm if this was you.`,
          // Path-only so the installed PWA opens (not a fresh browser tab)
          url: "/?open=loginAlert",
        });
      } catch { /* push optional */ }
    }

    return {
      success: true,
      sessionId,
      pendingApproval: true,
      replacedSession: false,
      expiresAt,
    };
  },
});

/** Auto-deny a pending login request after the 60s window. */
export const expireLoginAlert = internalMutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id || !sid) return { success: false };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { success: false };
      const alert = user.loginAlert;
      if (!alert || String(alert.sessionId) !== sid) return { success: true, skipped: true };
      if (alert.resolved || alert.status !== "pending") return { success: true, skipped: true };
      await db.patch(user._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
        activeDeviceAt: undefined,
      } as any);
      return { success: true, denied: true };
    } catch {
      return { success: false };
    }
  },
});

/** Keep the active session marked online while the app is open. */
export const touchUserSession = mutation({
  args: {
    userId: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id) return { success: false };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { success: false };
      const ids = getActiveSessionIds(user);
      const now = Date.now();

      if (sid && ids.includes(sid)) {
        await db.patch(user._id, { activeDeviceAt: now } as any);
        await upsertUserSession(db, {
          userId: id,
          sessionId: sid,
          deviceName: user.activeDeviceName,
          location: user.activeDeviceLocation,
          platform: user.activeDevicePlatform,
          now,
        });
        return { success: true, sessionId: sid };
      }

      // Local sessionId missing/stale but account still has sessions — rebind
      // so this signed-in tab keeps heartbeating and can receive Yes/No alerts.
      if (ids.length > 0) {
        const primary = ids[0];
        await db.patch(user._id, {
          activeDeviceAt: now,
          activeSessionId: primary,
          activeSessionIds: ids,
        } as any);
        await upsertUserSession(db, {
          userId: id,
          sessionId: primary,
          deviceName: user.activeDeviceName,
          location: user.activeDeviceLocation,
          platform: user.activeDevicePlatform,
          now,
        });
        return { success: true, sessionId: primary, rebound: true };
      }

      // No server sessions left — quietly create one for this already-signed-in device.
      // Preserve any pending loginAlert so Yes/No is not wiped by a heartbeat.
      const newSid = sid || genSessionId();
      const deviceName = String(user.activeDeviceName || "This device").slice(0, 120);
      const location = String(user.activeDeviceLocation || "Unknown location").slice(0, 160);
      const platform = String(user.activeDevicePlatform || "").slice(0, 80);
      const patch = activateSessionPatch(
        newSid,
        now,
        deviceName,
        location,
        platform,
      ) as any;
      const pending = user.loginAlert;
      if (
        pending
        && pending.status === "pending"
        && !pending.resolved
        && !isLoginAlertExpired(pending, now)
      ) {
        delete patch.loginAlert;
      }
      await db.patch(user._id, patch);
      await upsertUserSession(db, {
        userId: id,
        sessionId: newSid,
        deviceName,
        location,
        platform,
        now,
      });
      return { success: true, sessionId: newSid, created: true };
    } catch {
      return { success: false };
    }
  },
});

/** Clear this device's session on logout (other devices stay signed in). */
export const endUserSession = mutation({
  args: {
    userId: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    if (!id) return { success: false };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { success: false };
      const sid = String(sessionId || "").trim();
      const ids = getActiveSessionIds(user);
      if (sid) {
        if (!ids.includes(sid)) {
          await removeUserSession(db, id, sid);
          return { success: true, cleared: false };
        }
        const remaining = ids.filter((s) => s !== sid);
        if (remaining.length === 0) {
          await db.patch(user._id, {
            activeSessionId: undefined,
            activeSessionIds: undefined,
            activeDeviceAt: undefined,
            loginAlert: undefined,
          } as any);
        } else {
          await db.patch(user._id, {
            activeSessionId: remaining[0],
            activeSessionIds: remaining,
          } as any);
        }
        await removeUserSession(db, id, sid);
        return { success: true, cleared: true };
      }
      await db.patch(user._id, {
        activeSessionId: undefined,
        activeSessionIds: undefined,
        activeDeviceAt: undefined,
        loginAlert: undefined,
      } as any);
      await removeAllUserSessions(db, id);
      return { success: true, cleared: true };
    } catch {
      return { success: false };
    }
  },
});

/** List devices/sessions for Settings → Where you're logged in. */
export const listUserSessions = query({
  args: {
    userId: v.string(),
    currentSessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { userId, currentSessionId }) => {
    const uid = String(userId || "").trim();
    if (!uid) return [];
    const user = await db.get(uid as any) as any;
    if (!user) return [];
    const current = String(currentSessionId || "").trim();
    const activeIds = getActiveSessionIds(user);
    const rows = await db
      .query("userSessions")
      .withIndex("by_user", (q: any) => q.eq("userId", uid))
      .collect();

    const bySid = new Map(rows.map((r: any) => [String(r.sessionId), r]));
    // Ensure every activeSessionId appears even if metadata row is missing
    for (const sid of activeIds) {
      if (!bySid.has(sid)) {
        bySid.set(sid, {
          _id: null,
          userId: uid,
          sessionId: sid,
          deviceName:
            sid === String(user.activeSessionId || "")
              ? (user.activeDeviceName || "Unknown device")
              : "Unknown device",
          location:
            sid === String(user.activeSessionId || "")
              ? (user.activeDeviceLocation || "Unknown location")
              : "Unknown location",
          platform:
            sid === String(user.activeSessionId || "")
              ? user.activeDevicePlatform
              : undefined,
          createdAt: user.activeDeviceAt || Date.now(),
          lastActiveAt: user.activeDeviceAt || Date.now(),
        });
      }
    }

    const list = [...bySid.values()]
      .filter((r: any) => activeIds.includes(String(r.sessionId)))
      .map((r: any) => ({
        sessionId: String(r.sessionId),
        deviceName: String(r.deviceName || "Unknown device"),
        location: String(r.location || "Unknown location"),
        platform: r.platform ? String(r.platform) : "",
        createdAt: Number(r.createdAt) || 0,
        lastActiveAt: Number(r.lastActiveAt) || 0,
        isCurrent: !!current && String(r.sessionId) === current,
      }))
      .sort((a, b) => {
        if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
        return b.lastActiveAt - a.lastActiveAt;
      });

    return list;
  },
});

/** Log out one device/session from Settings. */
export const logoutSession = mutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id || !sid) return { success: false, message: "Missing session." };
    const user = await db.get(id as any) as any;
    if (!user) return { success: false, message: "Account not found." };
    const ids = getActiveSessionIds(user);
    const remaining = ids.filter((s) => s !== sid);
    if (remaining.length === 0) {
      await db.patch(user._id, {
        activeSessionId: undefined,
        activeSessionIds: undefined,
        activeDeviceAt: undefined,
        loginAlert: undefined,
      } as any);
    } else {
      await db.patch(user._id, {
        activeSessionId: remaining[0],
        activeSessionIds: remaining,
      } as any);
    }
    await removeUserSession(db, id, sid);
    return { success: true, remaining: remaining.length, loggedOutCurrent: !remaining.includes(sid) && ids.includes(sid) };
  },
});

/** Log out all devices. Pass keepSessionId to keep this device signed in. */
export const logoutAllSessions = mutation({
  args: {
    userId: v.string(),
    keepSessionId: v.optional(v.string()),
  },
  handler: async ({ db }, { userId, keepSessionId }) => {
    const id = String(userId || "").trim();
    const keep = String(keepSessionId || "").trim();
    if (!id) return { success: false, message: "Missing user." };
    const user = await db.get(id as any) as any;
    if (!user) return { success: false, message: "Account not found." };
    const ids = getActiveSessionIds(user);
    if (keep && ids.includes(keep)) {
      await db.patch(user._id, {
        activeSessionId: keep,
        activeSessionIds: [keep],
        activeDeviceAt: Date.now(),
        loginAlert: undefined,
      } as any);
      await removeAllUserSessions(db, id, keep);
      return { success: true, remaining: 1, keptCurrent: true };
    }
    await db.patch(user._id, {
      activeSessionId: undefined,
      activeSessionIds: undefined,
      activeDeviceAt: undefined,
      loginAlert: undefined,
    } as any);
    await removeAllUserSessions(db, id);
    return { success: true, remaining: 0, keptCurrent: false };
  },
});

/**
 * New device tapped Close on "Waiting for approval".
 * Drops the pending request and abandons the ghost "other" session so login can proceed.
 */
export const cancelPendingLogin = mutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id || !sid) return { success: false };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { success: false };
      // Clear gate so retry isn't stuck in Waiting for approval with nobody to confirm
      await db.patch(user._id, {
        loginAlert: undefined,
        loginBroadcast: undefined,
        activeSessionId: undefined,
        activeSessionIds: [],
        activeDeviceAt: undefined,
      } as any);
      return { success: true };
    } catch {
      return { success: false };
    }
  },
});

/** Other devices poll this — invalid when this session was removed (e.g. stale takeover). */
export const checkUserSession = query({
  args: {
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id || !sid) return { valid: false, reason: "missing" };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { valid: false, reason: "not_found" };
      const ids = getActiveSessionIds(user);
      if (ids.length === 0) return { valid: true, reason: "legacy" };
      if (ids.includes(sid)) {
        return {
          valid: true,
          reason: "ok",
          activeDeviceAt: user.activeDeviceAt ?? null,
          activeDeviceName: user.activeDeviceName ?? null,
          activeDeviceLocation: user.activeDeviceLocation ?? null,
        };
      }
      // Pending Yes/No — owner device must stay signed in (never force-logout)
      const alert = user.loginAlert;
      if (
        alert
        && alert.status === "pending"
        && !alert.resolved
        && !isLoginAlertExpired(alert)
        && String(alert.previousSessionId || "") === sid
      ) {
        return {
          valid: true,
          reason: "pending_approval",
          activeDeviceAt: user.activeDeviceAt ?? null,
          activeDeviceName: user.activeDeviceName ?? null,
          activeDeviceLocation: user.activeDeviceLocation ?? null,
        };
      }
      return {
        valid: false,
        // session_revoked covers Settings "log out device / all" (silent kick, no notice)
        reason: "session_revoked",
        activeDeviceAt: user.activeDeviceAt ?? null,
        activeDeviceName: user.activeDeviceName ?? null,
        activeDeviceLocation: user.activeDeviceLocation ?? null,
      };
    } catch {
      return { valid: false, reason: "error" };
    }
  },
});

/** Old device polls while still logged in — pending new-device approval request. */
export const getPendingLoginAlert = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const id = String(userId || "").trim();
    if (!id) return null;
    try {
      const user = await db.get(id as any) as any;
      if (!user?.loginAlert) return null;
      const alert = user.loginAlert;
      // Only brand-new pending requests (ignore legacy alerts without status)
      if (alert.resolved) return null;
      if (alert.status !== "pending") return null;
      if (isLoginAlertExpired(alert)) return null;
      return alert;
    } catch {
      return null;
    }
  },
});

/**
 * Fan-out sign-in notice for every device currently using this account.
 * Survives after Yes/No so other devices still learn the account was opened/blocked.
 */
export const getLoginBroadcast = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const id = String(userId || "").trim();
    if (!id) return null;
    try {
      const user = await db.get(id as any) as any;
      const b = user?.loginBroadcast;
      if (!b?.at || !b?.kind) return null;
      if (Date.now() - Number(b.at) > LOGIN_BROADCAST_TTL_MS) return null;
      return b;
    } catch {
      return null;
    }
  },
});

/** New device polls approval status for its provisional session. */
export const getLoginApprovalStatus = query({
  args: {
    userId: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { userId, sessionId }) => {
    const id = String(userId || "").trim();
    const sid = String(sessionId || "").trim();
    if (!id || !sid) return { status: "missing" as const };
    try {
      const user = await db.get(id as any) as any;
      if (!user) return { status: "missing" as const };
      const alert = user.loginAlert;
      if (alert && String(alert.sessionId) === sid) {
        let st = alert.status || (alert.resolved ? "approved" : "pending");
        if (st === "pending" && isLoginAlertExpired(alert)) st = "denied";
        return {
          status: st,
          deviceName: alert.deviceName,
          location: alert.location,
          at: alert.at,
          expiresAt: alert.expiresAt ?? ((Number(alert.at) || 0) + LOGIN_ALERT_TTL_MS),
        };
      }
      // Approved + activated (alert may already be cleared/resolved)
      if (getActiveSessionIds(user).includes(sid)) {
        return { status: "approved" as const };
      }
      return { status: "denied" as const };
    } catch {
      return { status: "missing" as const };
    }
  },
});

/** Old device: Yes — allow the new device AND keep this device signed in. */
export const confirmLoginAlert = mutation({
  args: {
    userId: v.string(),
    sessionId: v.string(),
    /** Owner device session — always keep this signed in after Yes */
    keepSessionId: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, { userId, sessionId, keepSessionId }) => {
    const user = await db.get(userId as any) as any;
    if (!user) return { success: false, message: "Account not found." };
    const alert = user.loginAlert;
    if (!alert || String(alert.sessionId) !== String(sessionId)) {
      return { success: false, message: "No pending login found." };
    }
    if (alert.status !== "pending" || alert.resolved) {
      return { success: false, message: "This login request already ended." };
    }
    if (isLoginAlertExpired(alert)) {
      await db.patch(user._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
        loginBroadcast: makeLoginBroadcast("blocked", alert),
      } as any);
      return { success: false, message: "Login request timed out." };
    }
    const newId = String(alert.sessionId);
    const prevId = String(
      keepSessionId
      || alert.previousSessionId
      || ""
    ).trim();
    const ids = getActiveSessionIds(user);
    if (prevId && !ids.includes(prevId)) ids.push(prevId);
    if (newId && !ids.includes(newId)) ids.push(newId);
    // Keep EVERY existing session + the new one — all devices stay signed in & get the notice
    const now = Date.now();
    const openedBroadcast = makeLoginBroadcast("opened", alert, now);
    await db.patch(user._id, {
      activeSessionId: prevId || newId,
      activeSessionIds: [...new Set(ids.filter(Boolean))],
      activeDeviceAt: now,
      activeDeviceName: user.activeDeviceName || alert.deviceName,
      activeDeviceLocation: user.activeDeviceLocation || alert.location,
      activeDevicePlatform: user.activeDevicePlatform || alert.platform,
      loginAlert: { ...alert, status: "approved", resolved: true },
      loginBroadcast: openedBroadcast,
    } as any);
    if (prevId) {
      await upsertUserSession(db, {
        userId: String(user._id),
        sessionId: prevId,
        deviceName: user.activeDeviceName || "This device",
        location: user.activeDeviceLocation || "Unknown location",
        platform: user.activeDevicePlatform,
        now,
      });
    }
    if (newId) {
      await upsertUserSession(db, {
        userId: String(user._id),
        sessionId: newId,
        deviceName: alert.deviceName || "Another device",
        location: alert.location || "Unknown location",
        platform: alert.platform,
        now,
      });
    }
    if (user.email) {
      try {
        await insertCustomerNotification(db, {
          email: String(user.email),
          type: "login_opened",
          title: "Account opened on another device",
          body: `Your DKMerch account was opened on ${alert.deviceName || "another device"}${alert.location ? ` · ${alert.location}` : ""}.`,
          url: "/",
        });
      } catch { /* optional */ }
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(user.email).toLowerCase(),
          title: "Account opened on another device",
          body: `${alert.deviceName || "Another device"}${alert.location ? ` · ${alert.location}` : ""}.`,
          url: "/",
        });
      } catch { /* optional */ }
    }
    return { success: true };
  },
});

/** Old device: No — deny the pending login; keep this device active. */
export const denyLoginAlert = mutation({
  args: {
    userId: v.string(),
    previousSessionId: v.optional(v.string()),
    newSessionId: v.string(),
  },
  handler: async ({ db, scheduler }, { userId, newSessionId }) => {
    const user = await db.get(userId as any) as any;
    if (!user) return { success: false, message: "Account not found." };

    const alert = user.loginAlert;
    const neu = String(newSessionId || "").trim();
    if (!neu) return { success: false, message: "Invalid session." };
    const now = Date.now();

    if (alert && String(alert.sessionId) === neu) {
      await db.patch(user._id, {
        loginAlert: { ...alert, status: "denied", resolved: true },
        loginBroadcast: makeLoginBroadcast("blocked", alert, now),
      } as any);
    }

    if (user.email) {
      try {
        await insertCustomerNotification(db, {
          email: String(user.email),
          type: "login_blocked",
          title: "Login blocked",
          body: "A sign-in attempt was denied on your account. If this wasn't you, change your password.",
          url: "/",
        });
      } catch { /* optional */ }
      try {
        await scheduler.runAfter(0, internal.webPush.sendToEmail, {
          email: String(user.email).toLowerCase(),
          title: "Login blocked",
          body: "A login attempt was denied. If this wasn't you, change your password.",
          url: "/",
        });
      } catch { /* optional */ }
    }

    return { success: true, revoked: true };
  },
});

/** Set / update login PIN after OTP verification (register or first login). */
export const setUserPin = mutation({
  args: {
    userId: v.id("users"),
    pin: v.string(),
  },
  handler: async ({ db }, { userId, pin }) => {
    if (!PIN_SET_RE.test(pin)) {
      return { success: false, message: "PIN must be exactly 6 digits." };
    }
    const user = await db.get(userId);
    if (!user) return { success: false, message: "Account not found." };
    const pinHash = await hashPin(pin);
    await db.patch(userId, {
      pin: pinHash,
      pinLength: 6,
      loginOtp: undefined,
      loginOtpExpiresAt: undefined,
    } as any);
    return { success: true, user: toSafeUser(user), pinLength: 6 };
  },
});

/** Second step when account already has a PIN. */
export const verifyLoginPin = mutation({
  args: {
    userId: v.id("users"),
    pin: v.string(),
  },
  handler: async ({ db }, { userId, pin }) => {
    const user = await db.get(userId) as any;
    if (!user) return { success: false, message: "Account not found." };
    if (user.status === "suspended" || user.status === "deleted" || user.status === "self_deactivated") {
      return { success: false, message: "This account cannot sign in right now." };
    }
    if (!user.pin) {
      return { success: false, message: "No PIN set. Please verify with OTP first.", needsPinSetup: true };
    }
    if (!PIN_RE.test(pin)) {
      return { success: false, message: "Incorrect PIN." };
    }
    // If we know the saved length, require exact digit count
    const savedLen = Number(user.pinLength);
    if (Number.isFinite(savedLen) && savedLen >= 4 && savedLen <= 6 && pin.length !== savedLen) {
      return { success: false, message: "Incorrect PIN." };
    }
    const pinHash = await hashPin(pin);
    const match =
      user.pin === pinHash ||
      // migrate legacy plaintext PINs on first successful login
      (isPlainPin(user.pin) && user.pin === pin);
    if (!match) {
      return { success: false, message: "Incorrect PIN." };
    }
    if (isPlainPin(user.pin)) {
      await db.patch(userId, { pin: pinHash, pinLength: pin.length } as any);
    } else if (!user.pinLength) {
      await db.patch(userId, { pinLength: pin.length } as any);
    }
    return { success: true, user: toSafeUser(user), pinLength: user.pinLength || pin.length };
  },
});

/** OTP for accounts that still need to create a PIN (or forgot PIN). */
export const generateLoginOtp = mutation({
  args: {
    userId: v.id("users"),
    resetPin: v.optional(v.boolean()),
  },
  handler: async ({ db }, { userId, resetPin }) => {
    const user = await db.get(userId) as any;
    if (!user) return { success: false, message: "Account not found." };
    // OTP is for Forgot PIN / reset only when a PIN already exists.
    // First-time Create PIN after password does NOT call this.
    if (user.pin && !resetPin) {
      return { success: false, message: "PIN already set. Use your PIN to sign in." };
    }
    if (!user.pin && !resetPin) {
      return { success: false, message: "No PIN yet — create one after signing in with your password." };
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const loginOtpExpiresAt = Date.now() + 1000 * 60 * 3;
    await db.patch(userId, { loginOtp: otp, loginOtpExpiresAt } as any);
    return {
      success: true,
      otp,
      email: user.email,
      name: user.name,
    };
  },
});

export const verifyLoginOtp = mutation({
  args: {
    userId: v.id("users"),
    otp: v.string(),
  },
  handler: async ({ db }, { userId, otp }) => {
    const user = await db.get(userId) as any;
    if (!user) return { success: false, message: "Account not found." };
    if (!user.loginOtp || !user.loginOtpExpiresAt) {
      return { success: false, message: "No OTP found. Please request a new code." };
    }
    if (Date.now() > user.loginOtpExpiresAt) {
      return { success: false, message: "OTP has expired. Please request a new code.", expired: true };
    }
    if (user.loginOtp !== otp) {
      return { success: false, message: "Incorrect OTP. Please try again." };
    }
    await db.patch(userId, {
      loginOtp: undefined,
      loginOtpExpiresAt: undefined,
    } as any);
    // Cleared PIN if this was a forgot-PIN reset path — client will set a new one
    return { success: true, user: toSafeUser(user), canSetPin: true };
  },
});

/** Clear PIN after OTP (forgot PIN), then client calls setUserPin. */
export const clearUserPinAfterOtp = mutation({
  args: { userId: v.id("users") },
  handler: async ({ db }, { userId }) => {
    const user = await db.get(userId) as any;
    if (!user) return { success: false, message: "Account not found." };
    await db.patch(userId, { pin: undefined, pinLength: undefined } as any);
    return { success: true };
  },
});

// ── Step 1 — Register to pending table only (NOT yet in users table)
export const registerPendingUser = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    fingerprint: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const nowMs = Date.now();

    const existingUser = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existingUser) {
      return { success: false, message: "Email already registered." };
    }

    const existingUsername = await db
      .query("users")
      .withIndex("by_username", q => q.eq("username", args.username))
      .first();
    if (existingUsername) {
      return { success: false, message: "Username already taken." };
    }

    if (args.fingerprint) {
      const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;
      const recentAttempts = await db
        .query("registrationAttempts")
        .withIndex("by_fingerprint", q => q.eq("fingerprint", args.fingerprint!))
        .collect();
      const recentCount = recentAttempts.filter(a => a.attemptedAt >= windowStart).length;

      await db.insert("registrationAttempts", {
        fingerprint: args.fingerprint,
        attemptedAt: nowMs,
        email: args.email,
      });

      if (recentCount >= RATE_LIMIT_MAX) {
        return {
          success: false,
          message: "Too many registration attempts. Please wait a few minutes before trying again.",
          rateLimited: true,
        };
      }
    }

    const existingPending = await db
      .query("pendingUsers")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existingPending) {
      await db.delete(existingPending._id);
    }

    const token = crypto.randomUUID();
    const expiresAt = nowMs + 1000 * 60 * 60 * 24;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = nowMs + 1000 * 60 * 3;

    await db.insert("pendingUsers", {
      name: args.name,
      username: args.username,
      email: args.email,
      password: args.password,
      token,
      expiresAt,
      createdAt: nowMs,
      otp,
      otpExpiresAt,
    });

    return { success: true, token, otp };
  },
});

async function scheduleWelcomePromoNotif(
  scheduler: { runAfter: (ms: number, fn: any, args: any) => Promise<any> },
  email: string,
  name: string
) {
  try {
    await scheduler.runAfter(0, internal.sendEmail.sendWelcomePromosToUser, {
      email: String(email || "").trim().toLowerCase(),
      name: name || "Customer",
    });
  } catch (err) {
    console.error("Failed to schedule welcome promo notification:", err);
  }
}

export const verifyOtpAndCreateUser = mutation({
  args: {
    email: v.string(),
    otp: v.string(),
  },
  handler: async ({ db, scheduler }, { email, otp }) => {
    const pending = await db
      .query("pendingUsers")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!pending) {
      return { success: false, message: "No pending registration found. Please register again." };
    }

    if (!pending.otp || !pending.otpExpiresAt) {
      return { success: false, message: "OTP not found. Please request a new code." };
    }

    if (Date.now() > pending.otpExpiresAt) {
      return { success: false, message: "OTP has expired. Please request a new code.", expired: true };
    }

    if (pending.otp !== otp) {
      return { success: false, message: "Incorrect OTP. Please try again." };
    }

    const alreadyExists = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", pending.email))
      .first();
    if (alreadyExists) {
      await db.delete(pending._id);
      return { success: false, message: "This email has already been registered." };
    }

    const userId = await db.insert("users", {
      name: pending.name,
      username: pending.username,
      email: pending.email,
      password: pending.password,
      role: "user",
      status: "active",
      registeredAt: new Date().toISOString(),
    });

    await db.delete(pending._id);
    await scheduleWelcomePromoNotif(scheduler, pending.email, pending.name);

    return { success: true, userId };
  },
});

export const resendOtp = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const pending = await db
      .query("pendingUsers")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!pending) {
      return { success: false, message: "No pending registration found. Please register again." };
    }

    const nowMs = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = nowMs + 1000 * 60 * 3;

    await db.patch(pending._id, { otp, otpExpiresAt });

    return { success: true, otp };
  },
});

export const verifyEmailAndCreateUser = mutation({
  args: { token: v.string() },
  handler: async ({ db, scheduler }, { token }) => {
    const pending = await db
      .query("pendingUsers")
      .withIndex("by_token", q => q.eq("token", token))
      .first();

    if (!pending) {
      return { success: false, message: "Invalid verification link. Please register again." };
    }

    if (Date.now() > pending.expiresAt) {
      await db.delete(pending._id);
      return { success: false, message: "Verification link has expired. Please register again.", expired: true };
    }

    const alreadyExists = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", pending.email))
      .first();
    if (alreadyExists) {
      await db.delete(pending._id);
      return { success: false, message: "This email has already been registered." };
    }

    const userId = await db.insert("users", {
      name: pending.name,
      username: pending.username,
      email: pending.email,
      password: pending.password,
      role: "user",
      status: "active",
      registeredAt: new Date().toISOString(),
    });

    await db.delete(pending._id);
    await scheduleWelcomePromoNotif(scheduler, pending.email, pending.name);

    return { success: true, userId };
  },
});

export const checkPendingVerification = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const pending = await db
      .query("pendingUsers")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!pending) return { exists: false };
    const isExpired = Date.now() > pending.expiresAt;
    return { exists: true, isExpired, expiresAt: pending.expiresAt };
  },
});

export const cleanupExpiredPendingUsers = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const now = Date.now();
    const allPending = await db.query("pendingUsers").collect();
    const expired = allPending.filter(p => p.expiresAt < now);
    for (const record of expired) {
      await db.delete(record._id);
    }
    return { deleted: expired.length };
  },
});

// ── Auto-unsuspend expired temporary suspensions (called by cron) ─────────────
export const autoUnsuspendExpired = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const now = Date.now();
    const users = await db.query("users").collect();
    const toUnsuspend = users.filter(
      u => u.status === "suspended" && u.suspendedUntil && u.suspendedUntil <= now
    );
    for (const user of toUnsuspend) {
      await db.patch(user._id, {
        status: "active",
        suspendedUntil: undefined,
        suspendedAt: undefined,
        suspendReason: undefined,
        suspendNote: undefined,
      });
    }
    return { unsuspended: toUnsuspend.length };
  },
});

export const createUser = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
  },
  handler: async ({ db, scheduler }, args) => {
    const existingEmail = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existingEmail) return { success: false, message: "Email already exists" };

    const existingUsername = await db
      .query("users")
      .withIndex("by_username", q => q.eq("username", args.username))
      .first();
    if (existingUsername) return { success: false, message: "Username already taken" };

    const nowMs = Date.now();
    let isSuspicious = false;

    if (args.fingerprint) {
      const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;
      const recentAttempts = await db
        .query("registrationAttempts")
        .withIndex("by_fingerprint", q => q.eq("fingerprint", args.fingerprint!))
        .collect();
      const recentCount = recentAttempts.filter(a => a.attemptedAt >= windowStart).length;
      await db.insert("registrationAttempts", {
        fingerprint: args.fingerprint,
        attemptedAt: nowMs,
        email: args.email,
      });
      if (recentCount >= RATE_LIMIT_MAX) {
        isSuspicious = true;
      }
    }

    const status = isSuspicious ? "pending_activation" : "active";
    const suspendReason = isSuspicious ? "spam_registration" : undefined;

    const id = await db.insert("users", {
      name: args.name,
      username: args.username,
      email: args.email,
      password: args.password,
      role: args.role || "user",
      status,
      ...(suspendReason ? { suspendReason } : {}),
      registeredAt: new Date(nowMs).toISOString(),
    });

    if (isSuspicious) {
      return {
        success: false,
        message: "Registration is temporarily restricted. Your account requires admin activation.",
        pendingActivation: true,
        id,
      };
    }

    await scheduleWelcomePromoNotif(scheduler, args.email, args.name);
    return { success: true, id };
  },
});

export const activateUser = mutation({
  args: { id: v.id("users") },
  handler: async ({ db, scheduler }, { id }) => {
    const user = await db.get(id);
    await db.patch(id, { status: "active", suspendReason: undefined });
    if (user?.email) {
      await scheduleWelcomePromoNotif(scheduler, user.email, user.name || user.username || "Customer");
    }
    return { success: true };
  },
});

// ── Suspend user with reason, duration, note — sends email via scheduler ──────
export const suspendUser = mutation({
  args: {
    id: v.id("users"),
    reason: v.string(),
    note: v.optional(v.string()),
    durationDays: v.optional(v.number()), // undefined = permanent
  },
  handler: async (ctx, { id, reason, note, durationDays }) => {
    const now = Date.now();
    const suspendedUntil = durationDays
      ? now + durationDays * 24 * 60 * 60 * 1000
      : undefined;

    await ctx.db.patch(id, {
      status: "suspended",
      suspendReason: reason,
      suspendNote: note ?? undefined,
      suspendedAt: now,
      suspendedUntil: suspendedUntil ?? undefined,
    });

    const user = await ctx.db.get(id);

    // Send suspension email server-side — no client useAction needed
    if (user?.email && user.email !== "admin") {
      await ctx.scheduler.runAfter(0, internal.sendEmail.sendSuspensionEmail, {
        to: user.email,
        name: user.name ?? user.username ?? "User",
        reason,
        note: note ?? undefined,
        suspendedUntil: suspendedUntil ?? undefined,
      });
    }

    return {
      success: true,
      userEmail: user?.email,
      userName: user?.name,
      suspendedUntil: suspendedUntil ?? null,
    };
  },
});

// ── Unsuspend (restore) user ──────────────────────────────────────────────────
export const unsuspendUser = mutation({
  args: { id: v.id("users") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, {
      status: "active",
      suspendReason: undefined,
      suspendNote: undefined,
      suspendedAt: undefined,
      suspendedUntil: undefined,
    });
    return { success: true };
  },
});

export const saveProfile = mutation({
  args: {
    userId: v.string(),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    barangay: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    addressLat: v.optional(v.number()),
    addressLng: v.optional(v.number()),
  },
  handler: async ({ db }, { userId, ...fields }) => {
    try {
      const user = await db.get(userId as any);
      if (!user) return { success: false };
      const updates: any = {};
      if (fields.fullName !== undefined) updates.fullName = fields.fullName;
      if (fields.phone !== undefined) updates.phone = fields.phone;
      if (fields.address !== undefined) updates.address = fields.address;
      if (fields.barangay !== undefined) updates.barangay = fields.barangay;
      if (fields.city !== undefined) updates.city = fields.city;
      if (fields.zipCode !== undefined) updates.zipCode = fields.zipCode;
      if (fields.addressLat !== undefined) updates.addressLat = fields.addressLat;
      if (fields.addressLng !== undefined) updates.addressLng = fields.addressLng;
      await db.patch(userId as any, updates);
      return { success: true };
    } catch {
      return { success: false };
    }
  },
});

export const updateUserRole = mutation({
  args: { id: v.id("users"), role: v.string() },
  handler: async ({ db }, { id, role }) => {
    await db.patch(id, { role });
    return { success: true };
  },
});

export const updateUserProfile = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    password: v.optional(v.string()),
    username: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const existing = await db.get(id);
    if (!existing) throw new Error("User not found.");

    const filtered: Record<string, unknown> = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );

    if (typeof filtered.username === "string") {
      const nextUsername = filtered.username.trim();
      const prevUsername = String((existing as any).username || "");
      if (nextUsername && nextUsername.toLowerCase() !== prevUsername.toLowerCase()) {
        const lastChange = Number((existing as any).usernameChangedAt || 0);
        if (lastChange > 0) {
          const elapsed = Date.now() - lastChange;
          if (elapsed < USERNAME_COOLDOWN_MS) {
            const daysLeft = Math.max(1, Math.ceil((USERNAME_COOLDOWN_MS - elapsed) / (24 * 60 * 60 * 1000)));
            throw new Error(
              `Username can only be changed once every 7 days. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
            );
          }
        }
        const taken = await db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", nextUsername))
          .first();
        if (taken && String(taken._id) !== String(id)) {
          throw new Error("That username is already taken.");
        }
        filtered.username = nextUsername;
        filtered.usernameChangedAt = Date.now();
      } else {
        // Unchanged (or case-only) — don't bump cooldown clock
        delete filtered.username;
      }
    }

    await db.patch(id, filtered as any);
    const updated = await db.get(id);
    return {
      success: true,
      message: "Profile updated!",
      usernameChangedAt: (updated as any)?.usernameChangedAt ?? null,
      username: (updated as any)?.username,
    };
  },
});

// ── Soft delete — 30-day recovery window, then permanent purge by cron ─────
export const softDeleteUser = mutation({
  args: {
    id: v.id("users"),
    reason: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async ({ db }, { id, reason, note }) => {
    const user = await db.get(id) as any;
    if (!user) return { success: false, message: "Account not found." };
    if (user.role === "admin" || user.email === "admin") {
      return { success: false, message: "Admin accounts cannot be deleted." };
    }
    const now = Date.now();
    await db.patch(id, {
      status: "deleted",
      deletedAt: now,
      suspendReason: reason || "self_deleted",
      suspendNote: note || undefined,
      // Clear any leftover reactivation OTP from prior deactivate
      reactivationOtp: undefined,
      reactivationOtpExpiresAt: undefined,
    } as any);
    return {
      success: true,
      deletedAt: now,
      recoverUntil: now + ACCOUNT_DELETE_GRACE_MS,
    };
  },
});

const clearUserCartWishlist = async (db: any, id: string, email: string) => {
  const userKeys = [String(id), email].filter(Boolean);
  for (const userId of userKeys) {
    const cartItems = await db
      .query("cart")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const row of cartItems) await db.delete(row._id);

    const wishItems = await db
      .query("wishlist")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const row of wishItems) await db.delete(row._id);
  }
};

/**
 * Admin delete = archive + unregister.
 * Snapshot goes to userArchives; live users row is removed so email/username can register again.
 */
export const deleteUser = mutation({
  args: {
    id: v.id("users"),
    archivedBy: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async ({ db }, { id, archivedBy, reason }) => {
    const user = await db.get(id) as any;
    if (!user) return { success: false, message: "User not found." };
    if (user.role === "admin" || user.email === "admin") {
      return { success: false, message: "Admin accounts cannot be deleted." };
    }

    const { _id, _creationTime, password, pin, loginOtp, loginOtpExpiresAt, reactivationOtp, reactivationOtpExpiresAt, ...rest } = user;

    await db.insert("userArchives", {
      originalUserId: String(_id),
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone,
      registeredAt: user.registeredAt,
      snapshot: { ...rest, hadPassword: !!password, hadPin: !!pin },
      archivedAt: Date.now(),
      archivedBy: archivedBy || "admin",
      reason: reason || "admin_delete",
    } as any);

    await clearUserCartWishlist(db, String(id), user.email);
    await db.delete(id);

    return {
      success: true,
      archived: true,
      message: "Account archived & unregistered. Email/username are free to register again.",
    };
  },
});

export const listUserArchives = query({
  args: {},
  handler: async ({ db }) => {
    return await db.query("userArchives").withIndex("by_archivedAt").order("desc").take(200);
  },
});

/** Wipe an archived account permanently (no restore). */
export const permanentDeleteUserArchive = mutation({
  args: { archiveId: v.id("userArchives") },
  handler: async ({ db }, { archiveId }) => {
    const row = await db.get(archiveId);
    if (!row) return { success: false, message: "Archive not found." };
    await db.delete(archiveId);
    return { success: true, message: "Archive permanently deleted." };
  },
});

const PRIMARY_ADMIN_EMAIL = "rayavelasquez26@gmail.com";
const PRIMARY_ADMIN_PASSWORD = "@Rayabisaya143";
const PRIMARY_ADMIN_USERNAME = "rayavelasquez26";

/** Ensure primary admin exists. First login with no PIN → Create PIN (no OTP). */
export const seedAdmin = mutation({
  args: {},
  handler: async ({ db }) => {
    const byPrimaryEmail = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", PRIMARY_ADMIN_EMAIL))
      .first();
    const byLegacyEmail = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", "admin"))
      .first();
    const byLegacyUsername = await db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", "admin"))
      .first();
    const byPrimaryUsername = await db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", PRIMARY_ADMIN_USERNAME))
      .first();

    const existing =
      byPrimaryEmail || byPrimaryUsername || byLegacyEmail || byLegacyUsername;

    if (existing) {
      // Always keep primary admin login as Raya credentials until a PIN exists.
      // After PIN is set, password can still be changed via Forgot Password (OTP).
      const patch: Record<string, any> = {
        role: "admin",
        status: "active",
        email: PRIMARY_ADMIN_EMAIL,
        username: PRIMARY_ADMIN_USERNAME,
        name: existing.name || "Administrator",
        password: PRIMARY_ADMIN_PASSWORD,
      };
      await db.patch(existing._id, patch);
      return { success: true, updated: true, email: PRIMARY_ADMIN_EMAIL };
    }

    await db.insert("users", {
      name: "Administrator",
      username: PRIMARY_ADMIN_USERNAME,
      email: PRIMARY_ADMIN_EMAIL,
      password: PRIMARY_ADMIN_PASSWORD,
      role: "admin",
      status: "active",
    });
    return { success: true, created: true };
  },
});

export const resetPasswordByEmail = mutation({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  handler: async ({ db }, { email, newPassword }) => {
    const trimmed = String(email || "").trim();
    const normalized = trimmed.toLowerCase();
    let user = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", trimmed))
      .first();
    if (!user && trimmed !== normalized) {
      user = await db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalized))
        .first();
    }
    if (!user) return { success: false, message: "No account found with that email." };
    await db.patch(user._id, { password: newPassword });
    return { success: true, message: "Password reset successfully!" };
  },
});

// ════════════════════════════════════════════════════════════════════
//  ACCOUNT MANAGEMENT — Self-service deactivation & reactivation
// ════════════════════════════════════════════════════════════════════

// ── Deactivate own account (temporary — reactivatable via OTP) ───────────────
export const deactivateOwnAccount = mutation({
  args: {
    id: v.id("users"),
    reason: v.string(),
    note: v.optional(v.string()),
  },
  handler: async ({ db }, { id, reason, note }) => {
    await db.patch(id, {
      status: "self_deactivated",
      suspendReason: reason,
      suspendNote: note ?? undefined,
      suspendedAt: Date.now(),
      // No suspendedUntil — self-deactivated is permanent until user reactivates
    });
    return { success: true };
  },
});

function canRecoverAccount(user: any, now = Date.now()) {
  if (!user) return { ok: false, reason: "not_found" as const };
  if (user.status === "self_deactivated") return { ok: true, kind: "deactivated" as const };
  if (user.status === "deleted") {
    const deletedAt = Number(user.deletedAt) || 0;
    const recoverUntil = deletedAt + ACCOUNT_DELETE_GRACE_MS;
    if (deletedAt > 0 && now < recoverUntil) {
      return { ok: true, kind: "deleted" as const, deletedAt, recoverUntil };
    }
    return { ok: false, reason: "expired" as const };
  }
  return { ok: false, reason: "not_recoverable" as const };
}

// ── Generate + store a reactivation OTP (deactivate OR deleted-within-30d) ───
export const generateReactivationOtp = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const user = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email))
      .first() as any;

    if (!user) return { success: false, message: "Account not found." };
    const gate = canRecoverAccount(user);
    if (!gate.ok) {
      if (gate.reason === "expired") {
        return {
          success: false,
          message: "The 30-day recovery window has ended. This account can no longer be restored.",
        };
      }
      return { success: false, message: "This account cannot be reactivated." };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = Date.now() + 1000 * 60 * 10; // 10 minutes

    await db.patch(user._id, {
      reactivationOtp: otp,
      reactivationOtpExpiresAt: otpExpiresAt,
    } as any);

    return {
      success: true,
      otp,
      userName: user.name,
      userId: user._id,
      kind: gate.kind,
      recoverUntil: gate.recoverUntil,
    };
  },
});

// ── Verify OTP and reactivate the account ────────────────────────────────────
export const reactivateAccount = mutation({
  args: {
    email: v.string(),
    otp: v.string(),
  },
  handler: async ({ db }, { email, otp }) => {
    const user = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email))
      .first() as any;

    if (!user) return { success: false, message: "Account not found." };
    const gate = canRecoverAccount(user);
    if (!gate.ok) {
      if (gate.reason === "expired") {
        return {
          success: false,
          message: "The 30-day recovery window has ended. This account can no longer be restored.",
        };
      }
      return { success: false, message: "This account cannot be reactivated." };
    }
    if (!user.reactivationOtp) {
      return { success: false, message: "No OTP found. Please request a new one." };
    }
    if (Date.now() > user.reactivationOtpExpiresAt) {
      return { success: false, message: "OTP has expired. Please request a new one.", expired: true };
    }
    if (user.reactivationOtp !== otp) {
      return { success: false, message: "Incorrect OTP. Please try again." };
    }

    await db.patch(user._id, {
      status: "active",
      suspendReason: undefined,
      suspendNote: undefined,
      suspendedAt: undefined,
      deletedAt: undefined,
      reactivationOtp: undefined,
      reactivationOtpExpiresAt: undefined,
    } as any);

    return { success: true, user: { ...user, status: "active", deletedAt: undefined }, kind: gate.kind };
  },
});

async function permanentlyPurgeDeletedUser(db: any, user: any) {
  if (!user || user.role === "admin" || user.email === "admin") return false;
  const { _id, _creationTime, password, pin, loginOtp, loginOtpExpiresAt, reactivationOtp, reactivationOtpExpiresAt, ...rest } = user;
  await db.insert("userArchives", {
    originalUserId: String(_id),
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone,
    registeredAt: user.registeredAt,
    snapshot: { ...rest, hadPassword: !!password, hadPin: !!pin },
    archivedAt: Date.now(),
    archivedBy: "system",
    reason: "self_delete_grace_expired",
  } as any);
  await clearUserCartWishlist(db, String(_id), user.email);
  await db.delete(_id);
  return true;
}

/** Daily: permanently remove soft-deleted accounts past the 30-day window. */
export const purgeExpiredDeletedAccounts = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const now = Date.now();
    const cutoff = now - ACCOUNT_DELETE_GRACE_MS;
    const users = await db.query("users").collect();
    let purged = 0;
    for (const user of users as any[]) {
      if (user.status !== "deleted") continue;
      const deletedAt = Number(user.deletedAt) || 0;
      if (!deletedAt || deletedAt > cutoff) continue;
      const ok = await permanentlyPurgeDeletedUser(db, user);
      if (ok) purged += 1;
    }
    return { success: true, purged };
  },
});

// Server-side password verification for account deactivation/delete flows
export const verifyUserPassword = mutation({
  args: {
    id: v.id("users"),
    password: v.string(),
  },
  handler: async ({ db }, { id, password }) => {
    const user = await db.get(id);
    if (!user) return { success: false, message: "User not found." };
    if (user.password !== password) return { success: false, message: "Incorrect password." };
    return { success: true };
  },
});
