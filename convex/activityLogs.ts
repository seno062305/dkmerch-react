import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const take = Math.min(Math.max(limit ?? 100, 1), 500);
    const rows = await ctx.db.query("activityLogs").order("desc").take(take);
    return rows;
  },
});

export const getCount = query({
  handler: async (ctx) => {
    const rows = await ctx.db.query("activityLogs").collect();
    return rows.length;
  },
});

export const logEvent = mutation({
  args: {
    action: v.string(),
    actorEmail: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.string()),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activityLogs", {
      action: args.action,
      actorEmail: args.actorEmail,
      actorName: args.actorName,
      actorRole: args.actorRole,
      details: args.details,
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

export const clearAll = mutation({
  args: {
    adminId: v.id("users"),
    password: v.string(),
  },
  handler: async (ctx, { adminId, password }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") {
      return { success: false, message: "Admin account required." };
    }
    if (admin.password !== password) {
      return { success: false, message: "Incorrect password." };
    }
    const rows = await ctx.db.query("activityLogs").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.insert("activityLogs", {
      action: "logs_cleared",
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: "admin",
      details: `Cleared ${rows.length} activity log(s)`,
      createdAt: Date.now(),
    });
    return { success: true, deleted: rows.length };
  },
});
