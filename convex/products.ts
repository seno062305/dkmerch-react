// convex/products.ts
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const phtToMs = (date: string, time: string): number => {
  return new Date(`${date}T${time}:00+08:00`).getTime();
};

// ── Regular products only (excludes pre-orders) ──
export const getAllProducts = query({
  args: {},
  handler: async ({ db }) => {
    const products = await db.query("products").order("desc").collect();
    return products.filter((p: any) => !p.isPreOrder && p.status !== "preorder");
  },
});

// ── All products for admin view (includes pre-orders + released ones) ──
export const getAllProductsAdmin = query({
  args: {},
  handler: async ({ db }) => {
    return await db.query("products").order("desc").collect();
  },
});

export const getProductById = query({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    return await db.get(id);
  },
});

// ── Pre-order products only (not yet released) ──
export const getPreOrderProducts = query({
  args: {},
  handler: async ({ db }) => {
    const products = await db.query("products").order("desc").collect();
    const nowMs = Date.now();

    return products.filter((p: any) => {
      if (!p.isPreOrder && p.status !== "preorder") return false;

      // If no release date set, still show in pre-order tab
      if (!p.releaseDate) return true;

      const releaseTime = p.releaseTime || "00:00";
      const releaseMs = phtToMs(p.releaseDate, releaseTime);

      // Only show if NOT yet released
      return nowMs < releaseMs;
    });
  },
});

// ── Collection products: regular + released pre-orders ──
export const getCollectionProducts = query({
  args: {},
  handler: async ({ db }) => {
    const products = await db.query("products").order("desc").collect();
    const nowMs = Date.now();

    return products.filter((p: any) => {
      // Regular (non-pre-order) products
      if (!p.isPreOrder && p.status !== "preorder") return true;

      // Released pre-orders (past release date)
      if (p.releaseDate) {
        const releaseTime = p.releaseTime || "00:00";
        const releaseMs = phtToMs(p.releaseDate, releaseTime);
        return nowMs >= releaseMs;
      }

      return false;
    });
  },
});

export const addProduct = mutation({
  args: {
    name: v.string(),
    price: v.number(),
    stock: v.number(),
    image: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releaseTime: v.optional(v.string()),
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
    saleStartDate: v.optional(v.string()),
    saleStartTime: v.optional(v.string()),
    saleEndDate: v.optional(v.string()),
    saleEndTime: v.optional(v.string()),
    isPreOrder: v.optional(v.boolean()),
  },
  handler: async ({ db }, args) => {
    const id = await db.insert("products", args);
    return { success: true, id };
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    stock: v.optional(v.number()),
    image: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releaseTime: v.optional(v.string()),
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
    saleStartDate: v.optional(v.string()),
    saleStartTime: v.optional(v.string()),
    saleEndDate: v.optional(v.string()),
    saleEndTime: v.optional(v.string()),
    isPreOrder: v.optional(v.boolean()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await db.patch(id, filtered);
    return { success: true };
  },
});

export const deleteProduct = mutation({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    await db.delete(id);
    return { success: true };
  },
});

export const decrementStock = mutation({
  args: { id: v.id("products"), qty: v.number() },
  handler: async ({ db }, { id, qty }) => {
    const product = await db.get(id);
    if (!product) return { success: false };
    await db.patch(id, { stock: Math.max(0, product.stock - qty) });
    return { success: true };
  },
});

// ── Manually release a pre-order to collections ──
export const releasePreOrderToCollection = mutation({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, {
      isPreOrder: false,
      status: "active",
      releasedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Due pre-order catalog items that still need to flip into regular products. */
export const getDuePreOrderProducts = internalQuery({
  args: {},
  handler: async ({ db }) => {
    const products = await db.query("products").collect();
    const nowMs = Date.now();
    return products.filter((p: any) => {
      if (!p.isPreOrder && p.status !== "preorder") return false;
      if (!p.releaseDate) return false;
      const releaseMs = phtToMs(p.releaseDate, p.releaseTime || "00:00");
      return Number.isFinite(releaseMs) && nowMs >= releaseMs;
    });
  },
});

/** Flip due pre-orders into the regular catalog; return ones that still need a release email blast. */
export const releaseDuePreOrderProducts = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const products = await db.query("products").collect();
    const nowMs = Date.now();
    const newlyReleased: any[] = [];

    for (const p of products as any[]) {
      if (!p.isPreOrder && p.status !== "preorder") continue;
      if (!p.releaseDate) continue;
      const releaseMs = phtToMs(p.releaseDate, p.releaseTime || "00:00");
      if (!Number.isFinite(releaseMs) || nowMs < releaseMs) continue;

      const needsAnnounce = !p.releaseAnnouncedAt;
      await db.patch(p._id, {
        isPreOrder: false,
        status: "active",
        releasedAt: p.releasedAt || nowMs,
      });

      if (needsAnnounce) {
        newlyReleased.push({
          _id: p._id,
          name: p.name,
          image: p.image,
          price: p.price,
          releaseDate: p.releaseDate,
          releaseTime: p.releaseTime || "00:00",
        });
      }
    }

    return newlyReleased;
  },
});

export const markProductReleaseAnnounced = internalMutation({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, { releaseAnnouncedAt: Date.now() });
    return { success: true };
  },
});