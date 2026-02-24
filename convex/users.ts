// convex/users.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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

// Get saved checkout profile for a user
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
        return { success: false, user: null, message: "Your account has been suspended." };
      }
      return { success: true, user };
    }
    return { success: false, user: null, message: "Invalid username/email or password" };
  },
});

export const createUser = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.optional(v.string()),
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

    const id = await db.insert("users", {
      name: args.name,
      username: args.username,
      email: args.email,
      password: args.password,
      role: args.role || "user",
    });

    return { success: true, id };
  },
});

// Save checkout profile (contact + address) to user record
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

// ✅ Updated — includes phone, name, username, password, role, status
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
      });
    }
    return { success: true };
  },
});

// ── ADD THIS AT THE BOTTOM OF convex/users.ts ──
// Used by sendEmail.ts to get all user emails for promo notification blast

export const getAllUsersForPromoNotif = query({
  args: {},
  handler: async ({ db }) => {
    const users = await db.query("users").collect();
    // Only return name + email — nothing sensitive
    return users
      .filter(u => u.email && u.role !== "admin")
      .map(u => ({ name: u.name ?? u.fullName ?? "there", email: u.email }));
  },
});