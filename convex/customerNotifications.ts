import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/** Shared insert used by order / promo / OFD flows (same DB transaction). */
export async function insertCustomerNotification(
  db: any,
  args: {
    email: string;
    type: string;
    title: string;
    body: string;
    url?: string;
    orderId?: string;
  }
) {
  const email = normalizeEmail(args.email);
  if (!email || !email.includes("@")) return null;
  return await db.insert("customerNotifications", {
    email,
    type: String(args.type || "update"),
    title: String(args.title || "DKMerch"),
    body: String(args.body || ""),
    url: args.url ? String(args.url) : undefined,
    orderId: args.orderId ? String(args.orderId) : undefined,
    createdAt: Date.now(),
    read: false,
  });
}

/** For actions (promo blast) that cannot touch db directly. */
export const create = internalMutation({
  args: {
    email: v.string(),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    orderId: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const id = await insertCustomerNotification(db, args);
    return { success: !!id, id };
  },
});

export const getRecentForEmail = query({
  args: { email: v.string(), limit: v.optional(v.number()) },
  handler: async ({ db }, { email, limit }) => {
    const key = normalizeEmail(email);
    if (!key) return [];
    const take = Math.min(80, Math.max(1, Number(limit) || 40));
    const rows = await db
      .query("customerNotifications")
      .withIndex("by_email_created", (q) => q.eq("email", key))
      .order("desc")
      .take(take);
    return rows;
  },
});

export const getUnreadCountForEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    if (!key) return 0;
    const unread = await db
      .query("customerNotifications")
      .withIndex("by_email_read", (q) => q.eq("email", key).eq("read", false))
      .collect();
    return unread.length;
  },
});

export const markRead = mutation({
  args: { id: v.id("customerNotifications"), email: v.string() },
  handler: async ({ db }, { id, email }) => {
    const row = await db.get(id);
    if (!row || normalizeEmail(row.email) !== normalizeEmail(email)) {
      return { success: false };
    }
    await db.patch(id, { read: true });
    return { success: true };
  },
});

export const markUnread = mutation({
  args: { id: v.id("customerNotifications"), email: v.string() },
  handler: async ({ db }, { id, email }) => {
    const row = await db.get(id);
    if (!row || normalizeEmail(row.email) !== normalizeEmail(email)) {
      return { success: false };
    }
    await db.patch(id, { read: false });
    return { success: true };
  },
});

export const markMany = mutation({
  args: {
    email: v.string(),
    ids: v.array(v.id("customerNotifications")),
    read: v.boolean(),
  },
  handler: async ({ db }, { email, ids, read }) => {
    const key = normalizeEmail(email);
    let count = 0;
    for (const id of ids) {
      const row = await db.get(id);
      if (!row || normalizeEmail(row.email) !== key) continue;
      await db.patch(id, { read });
      count += 1;
    }
    return { success: true, count };
  },
});

export const markAllRead = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    const unread = await db
      .query("customerNotifications")
      .withIndex("by_email_read", (q) => q.eq("email", key).eq("read", false))
      .collect();
    await Promise.all(unread.map((n) => db.patch(n._id, { read: true })));
    return { success: true, count: unread.length };
  },
});

export const markAllUnread = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    const rows = await db
      .query("customerNotifications")
      .withIndex("by_email", (q) => q.eq("email", key))
      .collect();
    await Promise.all(rows.map((n) => db.patch(n._id, { read: false })));
    return { success: true, count: rows.length };
  },
});

export const clearAll = mutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    const rows = await db
      .query("customerNotifications")
      .withIndex("by_email", (q) => q.eq("email", key))
      .collect();
    await Promise.all(rows.map((n) => db.delete(n._id)));
    return { success: true, deleted: rows.length };
  },
});
