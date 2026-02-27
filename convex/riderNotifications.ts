// convex/riderNotifications.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get all unread notifications (for bell badge count)
export const getUnread = query({
  handler: async ({ db }) => {
    return await db
      .query("riderNotifications")
      .withIndex("by_read", q => q.eq("read", false))
      .order("desc")
      .collect();
  },
});

// Get recent notifications for dropdown (last 20)
export const getRecent = query({
  handler: async ({ db }) => {
    return await db
      .query("riderNotifications")
      .order("desc")
      .take(20);
  },
});

// Mark all as read
export const markAllRead = mutation({
  handler: async ({ db }) => {
    const unread = await db
      .query("riderNotifications")
      .withIndex("by_read", q => q.eq("read", false))
      .collect();

    await Promise.all(unread.map(n => db.patch(n._id, { read: true })));
    return { success: true, count: unread.length };
  },
});