// convex/promos.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ── Get all promos (admin) ──
export const getAllPromos = query(async ({ db }) => {
  return await db.query("promos").collect();
});

// ── Get active promos only (for homepage display) ──
export const getActivePromos = query(async ({ db }) => {
  const today = new Date().toISOString().split("T")[0];
  const promos = await db.query("promos").collect();
  return promos.filter(
    (p) =>
      p.isActive &&
      (!p.startDate || p.startDate <= today) &&
      (!p.endDate || p.endDate >= today)
  );
});

// ── Validate promo code (used at checkout) ──
export const validatePromo = query({
  args: { code: v.string() },
  handler: async ({ db }, { code }) => {
    const today = new Date().toISOString().split("T")[0];
    const promo = await db
      .query("promos")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase().trim()))
      .first();

    if (!promo) return { valid: false, message: "Invalid promo code." };
    if (!promo.isActive) return { valid: false, message: "This promo is no longer active." };
    if (promo.startDate && promo.startDate > today)
      return { valid: false, message: "This promo has not started yet." };
    if (promo.endDate && promo.endDate < today)
      return { valid: false, message: "This promo has expired." };
    if (promo.maxUses && promo.usedCount >= promo.maxUses)
      return { valid: false, message: "This promo has reached its usage limit." };

    return {
      valid: true,
      promo: {
        code: promo.code,
        name: promo.name,
        discount: promo.discount,
        maxDiscount: promo.maxDiscount,
        type: promo.type,
        minOrder: promo.minOrder,
      },
    };
  },
});

// ── Create promo ──
export const createPromo = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    discount: v.number(),
    maxDiscount: v.number(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    minOrder: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async ({ db }, args) => {
    // Check duplicate code
    const existing = await db
      .query("promos")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase().trim()))
      .first();
    if (existing) return { success: false, message: "Promo code already exists." };

    const id = await db.insert("promos", {
      ...args,
      code: args.code.toUpperCase().trim(),
      type: "percentage",
      usedCount: 0,
    });
    return { success: true, id };
  },
});

// ── Update promo ──
export const updatePromo = mutation({
  args: {
    id: v.id("promos"),
    code: v.optional(v.string()),
    name: v.optional(v.string()),
    discount: v.optional(v.number()),
    maxDiscount: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    minOrder: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    if (filtered.code) filtered.code = (filtered.code as string).toUpperCase().trim();
    await db.patch(id, filtered);
    return { success: true };
  },
});

// ── Toggle active status ──
export const togglePromoStatus = mutation({
  args: { id: v.id("promos") },
  handler: async ({ db }, { id }) => {
    const promo = await db.get(id);
    if (!promo) return { success: false };
    await db.patch(id, { isActive: !promo.isActive });
    return { success: true };
  },
});

// ── Delete promo ──
export const deletePromo = mutation({
  args: { id: v.id("promos") },
  handler: async ({ db }, { id }) => {
    await db.delete(id);
    return { success: true };
  },
});

// ── Increment used count (call on successful order with promo) ──
export const incrementPromoUsage = mutation({
  args: { code: v.string() },
  handler: async ({ db }, { code }) => {
    const promo = await db
      .query("promos")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!promo) return { success: false };
    await db.patch(promo._id, { usedCount: promo.usedCount + 1 });
    return { success: true };
  },
});