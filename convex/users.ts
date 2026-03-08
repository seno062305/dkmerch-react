// convex/users.ts
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ── RATE LIMIT CONFIG ─────────────────────────────
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_MAX        = 5;             // max 5 attempts per fingerprint per 2 mins

// ── QUERIES ──────────────────────────────────────

export const getAllUsers = query(async ({ db }) => {
  return await db.query("users").collect();
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
  const users = await db.query("users").collect();
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

    const user = byEmail || byUsername;

    if (user && user.password === password) {
      if (user.status === "suspended") {
        return { success: false, user: null, message: "Your account has been suspended. Please contact support." };
      }
      if (user.status === "pending_activation") {
        return { success: false, user: null, message: "Your account is pending activation by an administrator." };
      }
      return { success: true, user };
    }
    return { success: false, user: null, message: "Invalid username/email or password" };
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

    // Check if email already exists in users (verified accounts)
    const existingUser = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existingUser) {
      return { success: false, message: "Email already registered." };
    }

    // Check if username already exists
    const existingUsername = await db
      .query("users")
      .withIndex("by_username", q => q.eq("username", args.username))
      .first();
    if (existingUsername) {
      return { success: false, message: "Username already taken." };
    }

    // Rate limit check via fingerprint
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

    // If there's already a pending entry for this email, delete it (allow resend)
    const existingPending = await db
      .query("pendingUsers")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    if (existingPending) {
      await db.delete(existingPending._id);
    }

    // Generate a secure UUID token (for email link verification — kept for compatibility)
    const token = crypto.randomUUID();
    const expiresAt = nowMs + 1000 * 60 * 60 * 24; // 24 hours

    // Generate 6-digit OTP — expires in 3 minutes
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = nowMs + 1000 * 60 * 3; // ← 3 minutes

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

// ── Step 2A — Verify OTP entered in modal, then create user immediately
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

    // Double-check email not already registered
    const alreadyExists = await db
      .query("users")
      .withIndex("by_email", q => q.eq("email", pending.email))
      .first();
    if (alreadyExists) {
      await db.delete(pending._id);
      return { success: false, message: "This email has already been registered." };
    }

    // Save to real users table
    const userId = await db.insert("users", {
      name: pending.name,
      username: pending.username,
      email: pending.email,
      password: pending.password,
      role: "user",
      status: "active",
      registeredAt: new Date().toISOString(),
    });

    // Clean up pending record
    await db.delete(pending._id);

    return { success: true, userId };
  },
});

// ── Resend OTP — generates a BRAND NEW OTP, immediately invalidates the old one
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
    // Generate fresh OTP — old OTP is overwritten and no longer valid
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = nowMs + 1000 * 60 * 3; // ← 3 minutes from now

    await db.patch(pending._id, { otp, otpExpiresAt });

    return { success: true, otp };
  },
});

// ── Step 2B — Verify token from email link (original flow — kept for compatibility)
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

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async ({ db }, { id }) => {
    await db.delete(id);
    return { success: true };
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