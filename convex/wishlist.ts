// convex/wishlist.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── QUERIES ──────────────────────────────────────

export const getWishlist = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    return await db
      .query("wishlist")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

export const isWishlisted = query({
  args: { userId: v.string(), productId: v.string() },
  handler: async ({ db }, { userId, productId }) => {
    const item = await db
      .query("wishlist")
      .withIndex("by_user_product", q =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .first();
    return !!item;
  },
});

// ── MUTATIONS ─────────────────────────────────────

export const toggleWishlist = mutation({
  args: {
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
  },
  handler: async ({ db }, { userId, productId, name, price, image }) => {
    const existing = await db
      .query("wishlist")
      .withIndex("by_user_product", q =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .first();

    if (existing) {
      await db.delete(existing._id);
      return { added: false };
    } else {
      await db.insert("wishlist", { userId, productId, name, price, image });
      return { added: true };
    }
  },
});

export const removeFromWishlist = mutation({
  args: { userId: v.string(), productId: v.string() },
  handler: async ({ db }, { userId, productId }) => {
    const item = await db
      .query("wishlist")
      .withIndex("by_user_product", q =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .first();

    if (item) await db.delete(item._id);
    return { success: true };
  },
});