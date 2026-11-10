import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const getLatestUpdate = query({
  handler: async ({ db }) => {
    const rows = await db.query("appUpdates").order("desc").take(1);
    return rows[0] || null;
  },
});

export const listUpdates = query({
  handler: async ({ db }) => {
    return await db.query("appUpdates").order("desc").take(20);
  },
});

export const publishUpdate = mutation({
  args: {
    version: v.string(),
    title: v.string(),
    message: v.string(),
    notifyEmail: v.optional(v.boolean()),
  },
  handler: async ({ db, scheduler }, args) => {
    const version = String(args.version || "").trim();
    const title = String(args.title || "").trim();
    const message = String(args.message || "").trim();
    if (!version || !title || !message) {
      return { success: false, message: "Version, title, and message are required." };
    }
    const now = Date.now();
    const id = await db.insert("appUpdates", {
      version,
      title,
      message,
      publishedAt: now,
      isActive: true,
    });

    // Deactivate older updates
    const older = await db.query("appUpdates").order("desc").collect();
    for (const row of older) {
      if (row._id !== id && row.isActive) {
        await db.patch(row._id, { isActive: false });
      }
    }

    if (args.notifyEmail !== false) {
      await scheduler.runAfter(0, internal.sendEmail.sendAppUpdateEmailToAllUsers, {
        version,
        title,
        message,
      });
    }

    return { success: true, id };
  },
});
