// convex/users.ts
import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// ── RATE LIMIT CONFIG ─────────────────────────────
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RATE_LIMIT_MAX        = 5;             // max 5 registrations per fingerprint per 2 mins
                                             // (the 6th+ account gets auto-suspended)

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

// ✅ NEW: Get all pending_activation users (for admin)
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

// ✅ UPDATED: createUser with rate limiting + auto-suspend on spam
export const createUser = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.optional(v.string()),
    fingerprint: v.optional(v.string()), // ✅ IP or browser fingerprint from client
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

    // ✅ Rate limit check — only if fingerprint is provided
    if (args.fingerprint) {
      const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;

      // Count registrations from this fingerprint within the window
      const recentAttempts = await db
        .query("registrationAttempts")
        .withIndex("by_fingerprint", q => q.eq("fingerprint", args.fingerprint!))
        .collect();

      const recentCount = recentAttempts.filter(a => a.attemptedAt >= windowStart).length;

      // Log this attempt
      await db.insert("registrationAttempts", {
        fingerprint: args.fingerprint,
        attemptedAt: nowMs,
        email: args.email,
      });

      // If more than RATE_LIMIT_MAX registrations in window → flag as suspicious
      if (recentCount >= RATE_LIMIT_MAX) {
        isSuspicious = true;
      }
    }

    // ✅ Auto-suspend if suspicious, otherwise active
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

// ✅ NEW: Admin activates a pending_activation user
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