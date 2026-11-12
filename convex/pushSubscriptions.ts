import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

export const saveSubscription = mutation({
  args: {
    email: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    role: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const email = normalizeEmail(args.email);
    const endpoint = String(args.endpoint || "").trim();
    const role = String(args.role || "user").trim().toLowerCase() || "user";
    if (!email || !endpoint || !args.p256dh || !args.auth) {
      return { success: false, message: "Invalid subscription." };
    }
    const now = Date.now();
    const existing = await db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    if (existing) {
      await db.patch(existing._id, {
        email,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent || existing.userAgent,
        role,
        updatedAt: now,
      });
      return { success: true, id: existing._id };
    }
    const id = await db.insert("pushSubscriptions", {
      email,
      endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent || "",
      role,
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, id };
  },
});

async function deleteByEndpoint(db: any, endpoint: string) {
  const row = await db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (q: any) => q.eq("endpoint", String(endpoint || "").trim()))
    .first();
  if (row) await db.delete(row._id);
  return { success: true };
}

export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async ({ db }, { endpoint }) => deleteByEndpoint(db, endpoint),
});

export const removeSubscriptionInternal = internalMutation({
  args: { endpoint: v.string() },
  handler: async ({ db }, { endpoint }) => deleteByEndpoint(db, endpoint),
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db
      .query("pushSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .collect();
  },
});

export const listByEmailInternal = internalQuery({
  args: {
    email: v.string(),
    /** When set, only subscriptions for this role (user/rider/admin). */
    role: v.optional(v.string()),
  },
  handler: async ({ db }, { email, role }) => {
    const rows = await db
      .query("pushSubscriptions")
      .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
      .collect();
    const want = String(role || "").trim().toLowerCase();
    if (!want) return rows;
    return rows.filter((r: any) => {
      const rRole = String(r.role || "user").trim().toLowerCase();
      return rRole === want;
    });
  },
});
