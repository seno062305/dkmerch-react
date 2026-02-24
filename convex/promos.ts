// convex/promos.ts
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ── Get server time (anti-cheat) ──
export const getServerTime = query({
  handler: async () => {
    return { now: Date.now() };
  },
});

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function toUtcMs(dateStr: string, timeStr?: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr ? timeStr.split(":").map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, d, h, m, 0) - PH_OFFSET_MS;
}

function fmt12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isPromoValid(promo: any, nowMs: number): { valid: boolean; message?: string } {
  if (!promo.isActive) return { valid: false, message: "This promo is no longer active." };

  if (promo.startDate) {
    const startMs = toUtcMs(promo.startDate, promo.startTime || "00:00");
    if (nowMs < startMs) return { valid: false, message: "This promo has not started yet." };
  }

  if (promo.endDate) {
    const endMs = toUtcMs(promo.endDate, promo.endTime || "23:59");
    if (nowMs > endMs) return {
      valid: false,
      message: promo.endTime
        ? `This promo expired at ${fmt12(promo.endTime)} on ${promo.endDate}.`
        : "This promo has expired."
    };
  }

  if (promo.maxUses && promo.usedCount >= promo.maxUses)
    return { valid: false, message: "This promo has reached its usage limit." };

  return { valid: true };
}

// ── Get all promos (admin) ──
export const getAllPromos = query(async ({ db }) => {
  return await db.query("promos").collect();
});

// ── Get active promos (homepage) — server time ──
export const getActivePromos = query(async ({ db }) => {
  const nowMs = Date.now();
  const promos = await db.query("promos").collect();
  return promos.filter((p) => isPromoValid(p, nowMs).valid);
});

// ── Validate promo code ──
export const validatePromo = query({
  args: { code: v.string() },
  handler: async ({ db }, { code }) => {
    const nowMs = Date.now();
    const promo = await db
      .query("promos")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase().trim()))
      .first();

    if (!promo) return { valid: false, message: "Invalid promo code." };

    const check = isPromoValid(promo, nowMs);
    if (!check.valid) return check;

    return {
      valid: true,
      promo: {
        code: promo.code,
        name: promo.name,
        discount: promo.discount,
        maxDiscount: promo.maxDiscount,
        type: promo.type,
        minOrder: promo.minOrder,
        startDate: promo.startDate,
        startTime: promo.startTime,
        endDate: promo.endDate,
        endTime: promo.endTime,
      },
    };
  },
});

// ── Create promo + trigger email blast to all users ──
export const createPromo = mutation({
  args: {
    code: v.string(),
    name: v.string(),
    discount: v.number(),
    maxDiscount: v.number(),
    startDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
    minOrder: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    isActive: v.boolean(),
  },
  handler: async ({ db, scheduler }, args) => {
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

    // Fire-and-forget: email all users about the new promo
    await scheduler.runAfter(0, internal.sendEmail.sendPromoNotificationToAllUsers, {
      promoCode:   args.code.toUpperCase().trim(),
      promoName:   args.name,
      discount:    args.discount,
      maxDiscount: args.maxDiscount,
      startDate:   args.startDate,
      startTime:   args.startTime,
      endDate:     args.endDate,
      endTime:     args.endTime,
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
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
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

// ── Increment used count ──
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

// ── Manual send: blast promo email to ALL users ──
export const sendPromoToUsers = mutation({
  args: {
    promoId: v.id("promos"),
    target: v.union(v.literal("all"), v.literal("group")),
  },
  handler: async ({ db, scheduler }, { promoId, target }) => {
    const promo = await db.get(promoId);
    if (!promo) return { success: false, message: "Promo not found.", count: 0 };

    // Count recipients for the return value
    const allUsers = await db.query("users").collect();
    const activeUsers = allUsers.filter(u => u.email && u.role !== "admin");

    const count = target === "all"
      ? activeUsers.length
      : activeUsers.filter(
          u => (u as any).favoriteGroup &&
               (u as any).favoriteGroup.toUpperCase() === promo.name.toUpperCase()
        ).length;

    if (count === 0) {
      return { success: false, message: "No users found for the selected target.", count: 0 };
    }

    // Schedule the email blast (sends to all users — filtering by group is a future enhancement)
    await scheduler.runAfter(0, internal.sendEmail.sendPromoNotificationToAllUsers, {
      promoCode:   promo.code,
      promoName:   promo.name,
      discount:    promo.discount,
      maxDiscount: promo.maxDiscount,
      startDate:   promo.startDate,
      startTime:   promo.startTime,
      endDate:     promo.endDate,
      endTime:     promo.endTime,
    });

    return { success: true, count };
  },
});