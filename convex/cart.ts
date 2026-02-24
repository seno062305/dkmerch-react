// convex/cart.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── QUERIES ──────────────────────────────────────

export const getCart = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    return await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
  },
});

// ── MUTATIONS ─────────────────────────────────────

export const addToCart = mutation({
  args: {
    userId:         v.string(),
    productId:      v.string(),
    name:           v.string(),
    price:          v.number(),
    image:          v.string(),
    finalPrice:     v.optional(v.number()),
    promoCode:      v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    promoDiscount:  v.optional(v.number()),
  },
  handler: async ({ db }, {
    userId, productId, name, price, image,
    finalPrice, promoCode, discountAmount, promoDiscount
  }) => {
    const hasPromo = !!promoCode;

    // Promo and non-promo entries for same product are SEPARATE cart items
    const allUserCart = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const existing = allUserCart.find(item => {
      if (item.productId !== productId) return false;
      if (hasPromo) return item.promoCode === promoCode;
      return !item.promoCode;
    });

    if (existing) {
      await db.patch(existing._id, { qty: existing.qty + 1 });
    } else {
      await db.insert("cart", {
        userId, productId, name, price, image, qty: 1,
        ...(finalPrice     !== undefined && { finalPrice }),
        ...(promoCode      !== undefined && { promoCode }),
        ...(discountAmount !== undefined && { discountAmount }),
        ...(promoDiscount  !== undefined && { promoDiscount }),
      });
    }
    return { success: true };
  },
});

// Remove by Convex _id (most reliable — used by CartModal)
export const removeFromCartById = mutation({
  args: { cartItemId: v.id("cart") },
  handler: async ({ db }, { cartItemId }) => {
    await db.delete(cartItemId);
    return { success: true };
  },
});

// Legacy remove by productId (kept for compatibility)
export const removeFromCart = mutation({
  args: { userId: v.string(), productId: v.string(), promoCode: v.optional(v.string()) },
  handler: async ({ db }, { userId, productId, promoCode }) => {
    const allUserCart = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const item = allUserCart.find(i => {
      if (i.productId !== productId) return false;
      if (promoCode) return i.promoCode === promoCode;
      return !i.promoCode;
    });

    if (item) await db.delete(item._id);
    return { success: true };
  },
});

// Update qty by Convex _id (most reliable)
export const updateQtyById = mutation({
  args: { cartItemId: v.id("cart"), qty: v.number() },
  handler: async ({ db }, { cartItemId, qty }) => {
    if (qty <= 0) {
      await db.delete(cartItemId);
    } else {
      await db.patch(cartItemId, { qty });
    }
    return { success: true };
  },
});

// Legacy update by productId
export const updateQty = mutation({
  args: { userId: v.string(), productId: v.string(), qty: v.number(), promoCode: v.optional(v.string()) },
  handler: async ({ db }, { userId, productId, qty, promoCode }) => {
    const allUserCart = await db
      .query("cart")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();

    const item = allUserCart.find(i => {
      if (i.productId !== productId) return false;
      if (promoCode) return i.promoCode === promoCode;
      return !i.promoCode;
    });

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
    for (const item of items) await db.delete(item._id);
    return { success: true };
  },
});