// convex/cart.js
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── QUERIES ──────────────────────────────────────

export const getCart = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    return await db.query("cart").withIndex("by_user", q => q.eq("userId", userId)).collect();
  },
});

// ── MUTATIONS ─────────────────────────────────────

export const addToCart = mutation({
  args: {
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
  },
  handler: async ({ db }, { userId, productId, name, price, image }) => {
    const existing = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("productId"), productId))
      .first();

    if (existing) {
      await db.patch(existing._id, { qty: existing.qty + 1 });
    } else {
      await db.insert("cart", { userId, productId, name, price, image, qty: 1 });
    }
    return { success: true };
  },
});

export const removeFromCart = mutation({
  args: { userId: v.string(), productId: v.string() },
  handler: async ({ db }, { userId, productId }) => {
    const item = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("productId"), productId))
      .first();

    if (item) await db.delete(item._id);
    return { success: true };
  },
});

export const updateQty = mutation({
  args: { userId: v.string(), productId: v.string(), qty: v.number() },
  handler: async ({ db }, { userId, productId, qty }) => {
    const item = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("productId"), productId))
      .first();

    if (!item) return { success: false };

    if (qty <= 0) {
      await db.delete(item._id);
    } else {
      await db.patch(item._id, { qty });
    }
    return { success: true };
  },
});

export const clearCart = mutation({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const items = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    for (const item of items) {
      await db.delete(item._id);
    }
    return { success: true };
  },
});