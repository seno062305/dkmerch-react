// convex/users.ts
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ── RATE LIMIT CONFIG ─────────────────────────────
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_MAX        = 5;             // max 5 attempts per fingerprint per 2 mins

// ── QUERIES ──────────────────────────────────────

export const getAllUsers = query(async ({ db }) => {
  return await db.query("users").order("desc").collect();
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db.query("users").withIndex("by_email", q => q.eq("email", email)).first();
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
    const byEmail = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", identifier))
      .first();

    const byUsername = await db
      .query("users")
      .withIndex("by_username", q => q.eq("username", identifier))
      .first();

    let user = byEmail || byUsername;

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

      // ── Soft-deleted: block login ──
      if (user.status === "deleted") {
        return {
          success: false,
          user: null,
          message: "This account has been deleted and is no longer accessible.",
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
      };

      // Admins skip PIN / second factor
      if (user.role === "admin") {
        return { success: true, user: safeUser, skipSecondFactor: true };
      }

      const hasPin = !!(user as any).pin && String((user as any).pin).length >= 4;
      if (hasPin) {
        return { success: true, user: safeUser, needsPin: true };
      }
      // First login / legacy accounts without PIN → OTP then create PIN
      return { success: true, user: safeUser, needsPinSetup: true };
    }
    return { success: false, user: null, message: "Invalid username/email or password" };
  },
});

const PIN_RE = /^\d{4,6}$/;

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
});

/** Set / update login PIN after OTP verification (register or first login). */
export const setUserPin = mutation({
  args: {
    userId: v.id("users"),
    pin: v.string(),
  },
  handler: async ({ db }, { userId, pin }) => {
    if (!PIN_RE.test(pin)) {
      return { success: false, message: "PIN must be 4–6 digits." };
    }
    const user = await db.get(userId);
    if (!user) return { success: false, message: "Account not found." };
    if (user.role === "admin") {
      return { success: false, message: "Admin accounts do not use a login PIN." };
    }
    const pinHash = await hashPin(pin);
    await db.patch(userId, {
      pin: pinHash,
      loginOtp: undefined,
      loginOtpExpiresAt: undefined,
    } as any);
    return { success: true, user: toSafeUser(user) };
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
    const pinHash = await hashPin(pin);
    const match =
      user.pin === pinHash ||
      // migrate legacy plaintext PINs on first successful login
      (isPlainPin(user.pin) && user.pin === pin);
    if (!match) {
      return { success: false, message: "Incorrect PIN." };
    }
    if (isPlainPin(user.pin)) {
      await db.patch(userId, { pin: pinHash } as any);
    }
    return { success: true, user: toSafeUser(user) };
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
    if (user.role === "admin") {
      return { success: false, message: "Admin accounts do not use login OTP." };
    }
    if (user.pin && !resetPin) {
      return { success: false, message: "PIN already set. Use your PIN to sign in." };
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
    await db.patch(userId, { pin: undefined } as any);
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

export const verifyOtpAndCreateUser = mutation({
  args: {
    email: v.string(),
    otp: v.string(),
  },
  handler: async ({ db }, { email, otp }) => {
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
  handler: async ({ db }, { token }) => {
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
  handler: async ({ db }, args) => {
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

    return { success: true, id };
  },
});

export const activateUser = mutation({
  args: { id: v.id("users") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, { status: "active", suspendReason: undefined });
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
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await db.patch(id, filtered);
    return { success: true, message: "Profile updated!" };
  },
});

// ── Soft delete — used by customer self-deletion (keeps record in DB) ────────
export const softDeleteUser = mutation({
  args: { id: v.id("users") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, {
      status: "deleted",
      deletedAt: Date.now(),
    } as any);
    return { success: true };
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

export const seedAdmin = mutation({
  args: {},
  handler: async ({ db }) => {
    const existing = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", "admin"))
      .first();
    if (!existing) {
      await db.insert("users", {
        name: "Administrator",
        username: "admin",
        email: "admin",
        password: "admin123",
        role: "admin",
        status: "active",
      });
    }
    return { success: true };
  },
});

export const resetPasswordByEmail = mutation({
  args: {
    email: v.string(),
    newPassword: v.string(),
  },
  handler: async ({ db }, { email, newPassword }) => {
    const user = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
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

// ── Generate + store a reactivation OTP on the user record ───────────────────
export const generateReactivationOtp = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const user = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!user) return { success: false, message: "Account not found." };
    if (user.status !== "self_deactivated") {
      return { success: false, message: "Account is not deactivated." };
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = Date.now() + 1000 * 60 * 10; // 10 minutes

    await db.patch(user._id, {
      reactivationOtp: otp,
      reactivationOtpExpiresAt: otpExpiresAt,
    } as any);

    return { success: true, otp, userName: user.name, userId: user._id };
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
    if (user.status !== "self_deactivated") {
      return { success: false, message: "Account is not deactivated." };
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
      reactivationOtp: undefined,
      reactivationOtpExpiresAt: undefined,
    } as any);

    return { success: true, user: { ...user, status: "active" } };
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
