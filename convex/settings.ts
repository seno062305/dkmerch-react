// convex/settings.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { insertCustomerNotification } from "./customerNotifications";

export const DEFAULT_SHIPPING_BASE_FARE = 49;

// ── GET SETTINGS ──────────────────────────────────────────────────────────────
export const getSettings = query({
  handler: async ({ db }) => {
    const row = await db.query("settings").first();
    if (!row) {
      return {
        storeName: "DKMerch Store",
        storeAddress: "",
        storeLat: 14.5995,
        storeLng: 120.9842,
        shippingBaseFare: DEFAULT_SHIPPING_BASE_FARE,
      };
    }
    return {
      ...row,
      shippingBaseFare:
        row.shippingBaseFare != null && Number.isFinite(Number(row.shippingBaseFare))
          ? Number(row.shippingBaseFare)
          : DEFAULT_SHIPPING_BASE_FARE,
    };
  },
});

// ── UPSERT SETTINGS ───────────────────────────────────────────────────────────
export const updateSettings = mutation({
  args: {
    storeLat:     v.optional(v.number()),
    storeLng:     v.optional(v.number()),
    storeAddress: v.optional(v.string()),
    storeName:    v.optional(v.string()),
    shippingBaseFare: v.optional(v.number()),
    /** When true and shipping fee changed, insert in-app bell notifs for customers only. */
    notifyShippingChange: v.optional(v.boolean()),
  },
  handler: async ({ db }, args) => {
    const existing = await db.query("settings").first();
    const prevFare =
      existing?.shippingBaseFare != null && Number.isFinite(Number(existing.shippingBaseFare))
        ? Number(existing.shippingBaseFare)
        : DEFAULT_SHIPPING_BASE_FARE;

    const filtered = Object.fromEntries(
      Object.entries({
        storeLat: args.storeLat,
        storeLng: args.storeLng,
        storeAddress: args.storeAddress,
        storeName: args.storeName,
        shippingBaseFare: args.shippingBaseFare,
      }).filter(([, val]) => val !== undefined)
    );

    if (existing) {
      await db.patch(existing._id, filtered);
    } else {
      await db.insert("settings", {
        storeLat:     args.storeLat     ?? 14.5995,
        storeLng:     args.storeLng     ?? 120.9842,
        storeAddress: args.storeAddress ?? "",
        storeName:    args.storeName    ?? "DKMerch Store",
        shippingBaseFare: args.shippingBaseFare ?? DEFAULT_SHIPPING_BASE_FARE,
      });
    }

    let notified = 0;
    const nextFare =
      args.shippingBaseFare != null && Number.isFinite(Number(args.shippingBaseFare))
        ? Number(args.shippingBaseFare)
        : null;

    if (
      args.notifyShippingChange
      && nextFare != null
      && nextFare !== prevFare
    ) {
      const users = await db.query("users").collect();
      const title = "Shipping fee updated";
      const body =
        `Base delivery fee is now ₱${nextFare.toLocaleString("en-PH")}. Shop now for your favorite merch!`;
      for (const u of users) {
        if (!u?.email || u.role === "admin") continue;
        const id = await insertCustomerNotification(db, {
          email: String(u.email),
          type: "shipping_fee",
          title,
          body,
          url: "/collections",
        });
        if (id) notified += 1;
      }
    }

    return { success: true, notified, shippingBaseFare: nextFare ?? prevFare };
  },
});
