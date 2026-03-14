// convex/settings.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── GET SETTINGS ──────────────────────────────────────────────────────────────
export const getSettings = query({
  handler: async ({ db }) => {
    return await db.query("settings").first();
  },
});

// ── UPSERT SETTINGS ───────────────────────────────────────────────────────────
export const updateSettings = mutation({
  args: {
    storeLat:     v.optional(v.number()),
    storeLng:     v.optional(v.number()),
    storeAddress: v.optional(v.string()),
    storeName:    v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const existing = await db.query("settings").first();
    const filtered = Object.fromEntries(
      Object.entries(args).filter(([, v]) => v !== undefined)
    );
    if (existing) {
      await db.patch(existing._id, filtered);
    } else {
      await db.insert("settings", {
        storeLat:     args.storeLat     ?? 14.5995,
        storeLng:     args.storeLng     ?? 120.9842,
        storeAddress: args.storeAddress ?? "",
        storeName:    args.storeName    ?? "DKMerch Store",
      });
    }
    return { success: true };
  },
});