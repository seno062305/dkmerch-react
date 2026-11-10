import { mutation } from "./_generated/server";

const KEEP_USER_EMAILS = new Set([
  "admin",
  "justinetrajano023@gmail.com",
  "nabel.leal04@gmail.com",
]);

const KEEP_RIDER_EMAILS = new Set([
  "nabel.leal04@gmail.com",
]);

async function clearTable(db: any, table: string) {
  const rows = await db.query(table).collect();
  for (const row of rows) await db.delete(row._id);
  return rows.length;
}

/**
 * Wipe test commerce data so a fresh order can be placed.
 * Keeps: admin user, justinetrajano023@gmail.com, rider nabel.leal04@gmail.com.
 */
export const wipeForFreshDemo = mutation({
  args: {},
  handler: async ({ db }) => {
    const deleted: Record<string, number> = {};

    deleted.orders = await clearTable(db, "orders");
    deleted.pickupRequests = await clearTable(db, "pickupRequests");
    deleted.riderLocations = await clearTable(db, "riderLocations");
    deleted.riderNotifications = await clearTable(db, "riderNotifications");
    deleted.cart = await clearTable(db, "cart");
    deleted.wishlist = await clearTable(db, "wishlist");
    deleted.preOrderRequests = await clearTable(db, "preOrderRequests");
    deleted.reviews = await clearTable(db, "reviews");
    deleted.activityLogs = await clearTable(db, "activityLogs");
    deleted.userPoints = await clearTable(db, "userPoints");
    deleted.rewardRedemptions = await clearTable(db, "rewardRedemptions");
    deleted.registrationAttempts = await clearTable(db, "registrationAttempts");

    // Users — keep admin + justine + nabel
    const users = await db.query("users").collect();
    let usersDeleted = 0;
    for (const u of users) {
      const email = String(u.email || "").trim().toLowerCase();
      const keep =
        u.role === "admin" ||
        KEEP_USER_EMAILS.has(email) ||
        email === "admin";
      if (!keep) {
        await db.delete(u._id);
        usersDeleted += 1;
      }
    }
    deleted.users = usersDeleted;

    try { deleted.pendingUsers = await clearTable(db, "pendingUsers"); } catch { deleted.pendingUsers = 0; }
    try { deleted.userArchives = await clearTable(db, "userArchives"); } catch { deleted.userArchives = 0; }

    // Riders — keep only nabel.leal04@gmail.com
    const riders = await db.query("riderApplications").collect();
    let ridersDeleted = 0;
    for (const r of riders) {
      const email = String(r.email || "").trim().toLowerCase();
      if (!KEEP_RIDER_EMAILS.has(email)) {
        await db.delete(r._id);
        ridersDeleted += 1;
      }
    }
    deleted.riders = ridersDeleted;

    return {
      success: true,
      deleted,
      keptUsers: [...KEEP_USER_EMAILS],
      keptRiders: [...KEEP_RIDER_EMAILS],
      message: "Demo data wiped. Ready for a fresh order test.",
    };
  },
});
