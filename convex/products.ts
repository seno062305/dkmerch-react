// convex/products.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Regular products only (excludes pre-orders) ──
export const getAllProducts = query(async ({ db }) => {
  const products = await db.query("products").collect();
  return products.filter(p => !p.isPreOrder && p.status !== "preorder");
});

// ── Admin: ALL products — regular + pre-order + released pre-orders ──
// ✅ Used by AdminProducts.jsx so released pre-orders remain visible and editable
export const getAllProductsAdmin = query(async ({ db }) => {
  return await db.query("products").collect();
});

export const getProductById = query({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    return await db.get(id);
  },
});

// ── Pre-order products only ──
// ✅ FIX: Only show items whose release time is still in the FUTURE
// Kapag passed na ang releaseDate+releaseTime, hindi na siya lalabas dito
// At lalabas na siya sa Collections automatically
export const getPreOrderProducts = query(async ({ db }) => {
  const products = await db.query("products").collect();
  const nowMs = Date.now();

  return products.filter(p => {
    // Must be marked as pre-order
    if (!p.isPreOrder && p.status !== "preorder") return false;

    // If no release date set yet, show it (still upcoming)
    if (!p.releaseDate) return true;

    // Compute release time in UTC (PHT = UTC+8, subtract 8hrs)
    const rt = (p as any).releaseTime || "00:00";
    const [h, m] = rt.split(":").map(Number);
    const [yr, mo, dy] = p.releaseDate.split("-").map(Number);
    const releaseMs = Date.UTC(yr, mo - 1, dy, h - 8, m, 0);

    // ✅ Only show if release is still in the future
    return nowMs < releaseMs;
  });
});

// ── Collections products (regular + released pre-orders) ──
// ✅ Shows regular products AND pre-order items whose release date has already passed
export const getCollectionProducts = query(async ({ db }) => {
  const products = await db.query("products").collect();
  const nowMs = Date.now();

  return products.filter(p => {
    // Regular (non-pre-order) products always show
    if (!p.isPreOrder && p.status !== "preorder") return true;

    // Pre-order items: only show in collections after release date passes
    if (!p.releaseDate) return false;

    const rt = (p as any).releaseTime || "00:00";
    const [h, m] = rt.split(":").map(Number);
    const [yr, mo, dy] = p.releaseDate.split("-").map(Number);
    const releaseMs = Date.UTC(yr, mo - 1, dy, h - 8, m, 0);

    return nowMs >= releaseMs;
  });
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
    isPreOrder: v.optional(v.boolean()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await db.patch(id, filtered);

    // ✅ FIX: Kung nagbago ang releaseDate o releaseTime, i-sync lahat ng
    // preOrderRequests na may same productId para ma-update ang releaseTimestampMs
    // Kundi, hindi mag-nonotify ang cron sa tamang oras
    const newDate = updates.releaseDate;
    const newTime = updates.releaseTime;

    if (newDate || newTime) {
      // Kuhanin ang current product para makuha ang missing date/time kung isa lang ang nabago
      const product = await db.get(id);
      if (!product) return { success: true };

      const rd = newDate ?? product.releaseDate ?? "";
      const rt = newTime ?? (product as any).releaseTime ?? "00:00";

      if (!rd || !rt) return { success: true };

      // Compute bagong UTC timestamp (PHT = UTC+8)
      const [h, m] = rt.split(":").map(Number);
      const [yr, mo, dy] = rd.split("-").map(Number);
      const newTimestampMs = Date.UTC(yr, mo - 1, dy, h - 8, m, 0);

      // I-update lahat ng preOrderRequests na hindi pa available para sa product na ito
      const requests = await db
        .query("preOrderRequests")
        .withIndex("by_product", (q) => q.eq("productId", id as unknown as string))
        .filter((q) => q.eq(q.field("isAvailable"), false))
        .collect();

      for (const req of requests) {
        await db.patch(req._id, {
          releaseDate: rd,
          releaseTime: rt,
          releaseTimestampMs: newTimestampMs,
          // ✅ I-reset din ang notifiedAt para ma-notify ulit sa bagong oras
          notifiedAt: null,
        });
      }
    }

    return { success: true };
  },
});

// ── NEW: Admin releases a pre-order product to Collections ──
// Sets isPreOrder=false so it disappears from Pre-Order tab and appears in Collections
export const releasePreOrderToCollection = mutation({
  args: { id: v.id("products") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, {
      isPreOrder: false,
      status: "active",
    });
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