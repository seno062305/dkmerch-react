import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DEFAULT_CATEGORIES = [
  { value: "albums", label: "Albums" },
  { value: "photocards", label: "Photocards" },
  { value: "lightsticks", label: "Lightsticks" },
  { value: "accessories", label: "Accessories" },
  { value: "apparel", label: "Apparel" },
];

const DEFAULT_GROUPS = [
  "BTS",
  "BLACKPINK",
  "TWICE",
  "SEVENTEEN",
  "STRAY KIDS",
  "EXO",
  "RED VELVET",
  "NEWJEANS",
].map((name) => ({ value: name, label: name }));

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(input: string) {
  return input
    .trim()
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mergeOptions(
  defaults: { value: string; label: string }[],
  custom: { value: string; label: string }[],
  fromProducts: string[],
  removed: Set<string>
) {
  const map = new Map<string, { value: string; label: string }>();
  for (const d of defaults) {
    if (!removed.has(d.value.toLowerCase())) map.set(d.value.toLowerCase(), d);
  }
  for (const c of custom) {
    if (!c.value) continue;
    const key = c.value.toLowerCase();
    if (removed.has(key)) continue;
    map.set(key, { value: c.value, label: c.label || c.value });
  }
  for (const raw of fromProducts) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    // Still show values used by products even if catalog-removed,
    // so existing product forms/filters keep working.
    if (!map.has(key)) map.set(key, { value: v, label: titleCase(v) });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

/** List categories or K-Pop groups: defaults + custom catalog + values already on products. */
export const list = query({
  args: {
    type: v.union(v.literal("category"), v.literal("kpopGroup")),
  },
  handler: async (ctx, { type }) => {
    const rows = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type", (q) => q.eq("type", type))
      .collect();

    const removed = new Set(
      rows.filter((r) => r.isRemoved).map((r) => r.value.toLowerCase())
    );
    const custom = rows.filter((r) => !r.isRemoved);

    const products = await ctx.db.query("products").collect();
    const fromProducts = products
      .map((p) => (type === "category" ? p.category : p.kpopGroup) || "")
      .filter(Boolean) as string[];

    const defaults = type === "category" ? DEFAULT_CATEGORIES : DEFAULT_GROUPS;
    return mergeOptions(
      defaults,
      custom.map((c) => ({ value: c.value, label: c.label })),
      fromProducts,
      removed
    );
  },
});

/** Add a custom category or K-Pop group. */
export const add = mutation({
  args: {
    type: v.union(v.literal("category"), v.literal("kpopGroup")),
    name: v.string(),
  },
  handler: async (ctx, { type, name }) => {
    const raw = String(name || "").trim();
    if (!raw) return { success: false, message: "Name is required." };
    if (raw.length < 2) return { success: false, message: "Name must be at least 2 characters." };
    if (raw.length > 40) return { success: false, message: "Name is too long (max 40)." };

    const value =
      type === "category" ? slugify(raw) : raw.replace(/\s+/g, " ").toUpperCase();
    const label = type === "category" ? titleCase(raw) : value;

    if (!value) return { success: false, message: "Invalid name." };

    const existing = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type_value", (q) => q.eq("type", type).eq("value", value))
      .first();

    if (existing) {
      if (existing.isRemoved) {
        await ctx.db.patch(existing._id, { isRemoved: false, label, createdAt: Date.now() });
        return { success: true, value: existing.value, label };
      }
      return { success: true, alreadyExists: true, value: existing.value, label: existing.label };
    }

    const defaults = type === "category" ? DEFAULT_CATEGORIES : DEFAULT_GROUPS;
    const defHit = defaults.find((d) => d.value.toLowerCase() === value.toLowerCase());
    if (defHit) {
      return { success: true, alreadyExists: true, value: defHit.value, label: defHit.label };
    }

    await ctx.db.insert("catalogOptions", {
      type,
      value,
      label,
      createdAt: Date.now(),
      isRemoved: false,
    });

    return { success: true, value, label };
  },
});

/** Remove a category or K-Pop group from the catalog (blocked if products still use it). */
export const remove = mutation({
  args: {
    type: v.union(v.literal("category"), v.literal("kpopGroup")),
    value: v.string(),
  },
  handler: async (ctx, { type, value }) => {
    const raw = String(value || "").trim();
    if (!raw) return { success: false, message: "Nothing to delete." };

    const products = await ctx.db.query("products").collect();
    const inUse = products.filter((p) => {
      const v = type === "category" ? p.category : p.kpopGroup;
      return String(v || "").trim().toLowerCase() === raw.toLowerCase();
    }).length;

    if (inUse > 0) {
      return {
        success: false,
        message: `Cannot delete — ${inUse} product(s) still use this ${type === "category" ? "category" : "group"}.`,
      };
    }

    const defaults = type === "category" ? DEFAULT_CATEGORIES : DEFAULT_GROUPS;
    const defHit = defaults.find((d) => d.value.toLowerCase() === raw.toLowerCase());
    const label = defHit?.label || titleCase(raw);
    const normalizedValue = defHit?.value || raw;

    const existing = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type_value", (q) => q.eq("type", type).eq("value", normalizedValue))
      .first();

    // Also try case-insensitive match for custom rows
    let row = existing;
    if (!row) {
      const all = await ctx.db
        .query("catalogOptions")
        .withIndex("by_type", (q) => q.eq("type", type))
        .collect();
      row = all.find((r) => r.value.toLowerCase() === raw.toLowerCase()) || null;
    }

    if (row) {
      if (row.isRemoved) {
        return { success: true, alreadyRemoved: true, value: row.value };
      }
      // Keep a tombstone so defaults stay hidden after delete
      await ctx.db.patch(row._id, { isRemoved: true });
      return { success: true, value: row.value };
    }

    // Default with no DB row yet — store tombstone
    await ctx.db.insert("catalogOptions", {
      type,
      value: normalizedValue,
      label,
      createdAt: Date.now(),
      isRemoved: true,
    });

    return { success: true, value: normalizedValue };
  },
});
