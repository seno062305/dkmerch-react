/**
 * One-shot wipe: delete all customer accounts + orders.
 * Keeps admin users and rider applications.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";

async function deleteAll(db: any, table: string) {
  const rows = await db.query(table).collect();
  for (const row of rows) {
    await db.delete(row._id);
  }
  return rows.length;
}

export const purgeCustomersAndOrders = mutation({
  args: {
    confirm: v.string(),
  },
  handler: async ({ db }, { confirm }) => {
    if (confirm !== "DELETE_CUSTOMERS_AND_ORDERS") {
      throw new Error('Pass confirm: "DELETE_CUSTOMERS_AND_ORDERS"');
    }

    const deleted: Record<string, number> = {};

    // Orders + counter
    deleted.orders = await deleteAll(db, "orders");
    deleted.orderCounters = await deleteAll(db, "orderCounters");

    // Customer-adjacent tables
    for (const table of [
      "cart",
      "wishlist",
      "reviews",
      "pendingUsers",
      "registrationAttempts",
      "userPoints",
      "rewardRedemptions",
      "pushSubscriptions",
      "quickSignInSessions",
      "preOrderRequests",
      "pickupRequests",
      "deliveryThreads",
      "deliveryMessages",
      "supportThreads",
      "supportMessages",
      "riderLocations",
      "riderNotifications",
    ] as const) {
      try {
        deleted[table] = await deleteAll(db, table);
      } catch {
        deleted[table] = 0;
      }
    }

    // Customer users only — keep admin
    const users = await db.query("users").collect();
    let customers = 0;
    let adminsKept = 0;
    for (const u of users) {
      const role = String((u as any).role || "user").toLowerCase();
      if (role === "admin") {
        adminsKept++;
        continue;
      }
      // Also skip anything that looks like a rider stored in users (legacy)
      if (role === "rider") {
        adminsKept++;
        continue;
      }
      await db.delete(u._id);
      customers++;
    }
    deleted.customerUsers = customers;
    deleted.adminsKept = adminsKept;

    // Rider applications / accounts — KEEP (do not delete)
    const riders = await db.query("riderApplications").collect();
    deleted.ridersKept = riders.length;

    return { ok: true, deleted };
  },
});
