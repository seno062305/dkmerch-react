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

/** Built-in marquee logos for default groups (public/images). */
const DEFAULT_GROUP_LOGOS: Record<string, string> = {
  bts: "/images/BTS_logo.png",
  blackpink: "/images/BLACKPINK-Logo-Font-1.webp",
  twice: "/images/TWICE-Logo.png",
  seventeen: "/images/Seventeen-logo.png",
  "stray kids": "/images/straykids.jpg",
  exo: "/images/Exo-Logo.png",
  "red velvet": "/images/redvelvet.jpg",
  newjeans: "/images/newjeans.jpg",
};

type OptionRow = {
  value: string;
  label: string;
  image?: string | null;
  imageStorageId?: string | null;
};

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
  custom: OptionRow[],
  fromProducts: string[],
  removed: Set<string>
) {
  const map = new Map<string, OptionRow>();
  for (const d of defaults) {
    if (!removed.has(d.value.toLowerCase())) {
      map.set(d.value.toLowerCase(), {
        ...d,
        image: DEFAULT_GROUP_LOGOS[d.value.toLowerCase()] || null,
      });
    }
  }
  for (const c of custom) {
    if (!c.value) continue;
    const key = c.value.toLowerCase();
    if (removed.has(key)) continue;
    const fallbackLogo = DEFAULT_GROUP_LOGOS[key] || null;
    map.set(key, {
      value: c.value,
      label: c.label || c.value,
      image: c.image || fallbackLogo,
      imageStorageId: c.imageStorageId || null,
    });
  }
  for (const raw of fromProducts) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    // Still show values used by products even if catalog-removed,
    // so existing product forms/filters keep working.
    if (!map.has(key)) {
      map.set(key, {
        value: v,
        label: titleCase(v),
        image: DEFAULT_GROUP_LOGOS[key] || null,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

async function resolveImage(
  storage: { getUrl: (id: any) => Promise<string | null> },
  row: { image?: string | null; imageStorageId?: any }
) {
  if (row.imageStorageId) {
    const url = await storage.getUrl(row.imageStorageId);
    if (url) return url;
  }
  if (row.image) return row.image;
  return null;
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
    const merged = mergeOptions(
      defaults,
      custom.map((c) => ({
        value: c.value,
        label: c.label,
        image: c.image,
        imageStorageId: c.imageStorageId,
      })),
      type === "kpopGroup" ? fromProducts : [],
      removed
    );

    if (type !== "kpopGroup") {
      return merged.map(({ value, label }) => ({ value, label }));
    }

    // Resolve Convex storage URLs for uploaded logos
    const withUrls = [];
    for (const item of merged) {
      const customRow = custom.find(
        (c) => c.value.toLowerCase() === item.value.toLowerCase()
      );
      const image = customRow
        ? await resolveImage(ctx.storage, customRow)
        : item.image || DEFAULT_GROUP_LOGOS[item.value.toLowerCase()] || null;
      withUrls.push({
        value: item.value,
        label: item.label,
        image: image || item.image || null,
      });
    }
    return withUrls;
  },
});

/**
 * Groups that appear on the homepage Logo Marquee.
 * Defaults with built-in logos + any custom group that has an image.
 */
export const listForMarquee = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type", (q) => q.eq("type", "kpopGroup"))
      .collect();

    const removed = new Set(
      rows.filter((r) => r.isRemoved).map((r) => r.value.toLowerCase())
    );
    const custom = rows.filter((r) => !r.isRemoved);

    const map = new Map<string, { name: string; logo: string }>();

    for (const d of DEFAULT_GROUPS) {
      const key = d.value.toLowerCase();
      if (removed.has(key)) continue;
      const logo = DEFAULT_GROUP_LOGOS[key];
      if (logo) map.set(key, { name: d.value, logo });
    }

    for (const c of custom) {
      const key = c.value.toLowerCase();
      if (removed.has(key)) continue;
      const logo = await resolveImage(ctx.storage, c);
      if (logo) {
        map.set(key, { name: c.value, logo });
      } else if (!map.has(key) && DEFAULT_GROUP_LOGOS[key]) {
        map.set(key, { name: c.value, logo: DEFAULT_GROUP_LOGOS[key] });
      }
    }

    // Stable order: defaults first (as defined), then extra custom A–Z
    const defaultOrder = DEFAULT_GROUPS.map((g) => g.value.toLowerCase());
    const items = Array.from(map.values());
    items.sort((a, b) => {
      const ai = defaultOrder.indexOf(a.name.toLowerCase());
      const bi = defaultOrder.indexOf(b.name.toLowerCase());
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async ({ storage }) => {
    return await storage.generateUploadUrl();
  },
});

/** Add a custom category or K-Pop group. K-Pop groups should include a marquee image. */
export const add = mutation({
  args: {
    type: v.union(v.literal("category"), v.literal("kpopGroup")),
    name: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { type, name, image, imageStorageId }) => {
    const raw = String(name || "").trim();
    if (!raw) return { success: false, message: "Name is required." };
    if (raw.length < 2) return { success: false, message: "Name must be at least 2 characters." };
    if (raw.length > 40) return { success: false, message: "Name is too long (max 40)." };

    const value =
      type === "category" ? slugify(raw) : raw.replace(/\s+/g, " ").toUpperCase();
    const label = type === "category" ? titleCase(raw) : value;

    if (!value) return { success: false, message: "Invalid name." };

    const imagePath = String(image || "").trim() || undefined;

    if (type === "kpopGroup" && !imageStorageId && !imagePath) {
      // Allow re-selecting an existing default without forcing a new upload
      const defHit = DEFAULT_GROUPS.find((d) => d.value.toLowerCase() === value.toLowerCase());
      if (!defHit) {
        return {
          success: false,
          message: "Marquee image is required for new K-Pop groups.",
        };
      }
    }

    const existing = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type_value", (q) => q.eq("type", type).eq("value", value))
      .first();

    if (existing) {
      if (existing.isRemoved) {
        await ctx.db.patch(existing._id, {
          isRemoved: false,
          label,
          createdAt: Date.now(),
          ...(imagePath ? { image: imagePath } : {}),
          ...(imageStorageId ? { imageStorageId } : {}),
        });
        return { success: true, value: existing.value, label };
      }
      // Existing active group — update image if provided
      if (imageStorageId || imagePath) {
        const patch: Record<string, unknown> = {};
        if (imagePath) patch.image = imagePath;
        if (imageStorageId) {
          if (existing.imageStorageId && existing.imageStorageId !== imageStorageId) {
            try {
              await ctx.storage.delete(existing.imageStorageId);
            } catch {
              /* ignore */
            }
          }
          patch.imageStorageId = imageStorageId;
        }
        await ctx.db.patch(existing._id, patch);
      }
      return { success: true, alreadyExists: true, value: existing.value, label: existing.label };
    }

    const defaults = type === "category" ? DEFAULT_CATEGORIES : DEFAULT_GROUPS;
    const defHit = defaults.find((d) => d.value.toLowerCase() === value.toLowerCase());
    if (defHit) {
      // Persist a row if they're attaching a custom logo to a default group
      if (type === "kpopGroup" && (imageStorageId || imagePath)) {
        await ctx.db.insert("catalogOptions", {
          type,
          value: defHit.value,
          label: defHit.label,
          createdAt: Date.now(),
          isRemoved: false,
          ...(imagePath ? { image: imagePath } : {}),
          ...(imageStorageId ? { imageStorageId } : {}),
        });
      }
      return { success: true, alreadyExists: true, value: defHit.value, label: defHit.label };
    }

    await ctx.db.insert("catalogOptions", {
      type,
      value,
      label,
      createdAt: Date.now(),
      isRemoved: false,
      ...(imagePath ? { image: imagePath } : {}),
      ...(imageStorageId ? { imageStorageId } : {}),
    });

    return { success: true, value, label };
  },
});

/** Set / replace the marquee logo for an existing K-Pop group. */
export const setGroupImage = mutation({
  args: {
    value: v.string(),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { value, image, imageStorageId }) => {
    const raw = String(value || "").trim();
    if (!raw) return { success: false, message: "Group is required." };
    if (!imageStorageId && !String(image || "").trim()) {
      return { success: false, message: "Image is required." };
    }

    const all = await ctx.db
      .query("catalogOptions")
      .withIndex("by_type", (q) => q.eq("type", "kpopGroup"))
      .collect();
    let row = all.find((r) => r.value.toLowerCase() === raw.toLowerCase()) || null;

    const defHit = DEFAULT_GROUPS.find((d) => d.value.toLowerCase() === raw.toLowerCase());
    const normalizedValue = defHit?.value || raw.replace(/\s+/g, " ").toUpperCase();
    const label = defHit?.label || normalizedValue;

    const imagePath = String(image || "").trim() || undefined;

    if (!row) {
      await ctx.db.insert("catalogOptions", {
        type: "kpopGroup",
        value: normalizedValue,
        label,
        createdAt: Date.now(),
        isRemoved: false,
        ...(imagePath ? { image: imagePath } : {}),
        ...(imageStorageId ? { imageStorageId } : {}),
      });
      return { success: true, value: normalizedValue };
    }

    if (imageStorageId && row.imageStorageId && row.imageStorageId !== imageStorageId) {
      try {
        await ctx.storage.delete(row.imageStorageId);
      } catch {
        /* ignore */
      }
    }

    await ctx.db.patch(row._id, {
      isRemoved: false,
      ...(imagePath ? { image: imagePath } : {}),
      ...(imageStorageId ? { imageStorageId } : {}),
    });
    return { success: true, value: row.value };
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
      if (row.imageStorageId) {
        try {
          await ctx.storage.delete(row.imageStorageId);
        } catch {
          /* ignore */
        }
      }
      // Keep a tombstone so defaults stay hidden after delete
      await ctx.db.patch(row._id, {
        isRemoved: true,
        image: undefined,
        imageStorageId: undefined,
      });
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
