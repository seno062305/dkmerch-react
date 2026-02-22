// convex/products.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Regular products only (excludes pre-orders) ──
export const getAllProducts = query(async ({ db }) => {
  const products = await db.query("products").collect();
  return products.filter(p => !p.isPreOrder && p.status !== "preorder");
});

export const getProductById = query({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    return await db.get(id);
  },
});

// ── Pre-order products only ──
export const getPreOrderProducts = query(async ({ db }) => {
  const products = await db.query("products").collect();
  return products.filter(p => p.isPreOrder || p.status === "preorder");
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
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
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
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
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