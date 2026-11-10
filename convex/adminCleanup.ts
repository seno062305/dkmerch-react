import { mutation, internalMutation } from "./_generated/server";

const KEEP_USER_EMAILS = new Set([
  "admin",
  "justinetrajano023@gmail.com",
  "nabel.leal04@gmail.com",
]);

const KEEP_RIDER_EMAILS = new Set([
  "nabel.leal04@gmail.com",
]);

/** Tables that grow fast and are safe to wipe as "cache". */
const EPHEMERAL_TABLES = [
  "activityLogs",
  "registrationAttempts",
  "pendingUsers",
  "riderLocations",
  "riderNotifications",
] as const;

async function clearTable(db: any, table: string) {
  const rows = await db.query(table).collect();
  for (const row of rows) await db.delete(row._id);
  return rows.length;
}

const RIDER_BLOB_FIELDS = ["riderPhoto", "validId1", "validId2"] as const;
const BLOB_MIN_LEN = 2_000; // keep tiny placeholders; strip base64 / data-URL blobs

/**
 * Permanently delete ephemeral / cache-like Convex rows that fill the DB fast.
 * Also strips oversized base64 rider ID/photo blobs (account rows stay).
 * Does NOT touch products, orders, users, promos, reviews, etc.
 */
export const purgeEphemeralCache = mutation({
  args: {},
  handler: async ({ db }) => {
    const deleted: Record<string, number> = {};
    let total = 0;
    for (const table of EPHEMERAL_TABLES) {
      try {
        const n = await clearTable(db, table);
        deleted[table] = n;
        total += n;
      } catch {
        deleted[table] = 0;
      }
    }

    // Dead weight: base64 photos/IDs embedded in riderApplications (~50KB each)
    let riderBlobs = 0;
    try {
      const riders = await db.query("riderApplications").collect();
      for (const r of riders) {
        const patch: Record<string, null> = {};
        for (const field of RIDER_BLOB_FIELDS) {
          const val = (r as any)[field];
          if (typeof val === "string" && val.length >= BLOB_MIN_LEN) {
            patch[field] = null;
          }
        }
        if (Object.keys(patch).length) {
          await db.patch(r._id, patch);
          riderBlobs += 1;
        }
      }
    } catch {
      /* table may be empty / missing */
    }
    deleted.riderPhotoBlobs = riderBlobs;
    total += riderBlobs;

    return {
      success: true,
      deleted,
      total,
      message: `Permanently cleared ${total} cache rows/blobs from Convex.`,
    };
  },
});

/**
 * Auto-trim old ephemeral rows so the DB does not refill as fast.
 * Keeps recent rider GPS (3 days) and recent activity logs (14 days).
 */
export const purgeOldEphemeral = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const now = Date.now();
    const deleted: Record<string, number> = {};

    // Rider GPS older than 3 days
    const locations = await db.query("riderLocations").collect();
    let locDel = 0;
    for (const row of locations) {
      if (Number(row.updatedAt || 0) < now - 3 * 24 * 60 * 60 * 1000) {
        await db.delete(row._id);
        locDel += 1;
      }
    }
    deleted.riderLocations = locDel;

    // Activity logs older than 14 days
    const logs = await db.query("activityLogs").collect();
    let logDel = 0;
    for (const row of logs) {
      if (Number(row.createdAt || 0) < now - 14 * 24 * 60 * 60 * 1000) {
        await db.delete(row._id);
        logDel += 1;
      }
    }
    deleted.activityLogs = logDel;

    // Registration attempts older than 7 days
    const attempts = await db.query("registrationAttempts").collect();
    let attDel = 0;
    for (const row of attempts) {
      if (Number(row.attemptedAt || 0) < now - 7 * 24 * 60 * 60 * 1000) {
        await db.delete(row._id);
        attDel += 1;
      }
    }
    deleted.registrationAttempts = attDel;

    // Expired pending signups
    const pending = await db.query("pendingUsers").collect();
    let pendDel = 0;
    for (const row of pending) {
      if (Number(row.expiresAt || 0) < now) {
        await db.delete(row._id);
        pendDel += 1;
      }
    }
    deleted.pendingUsers = pendDel;

    // Rider notifications older than 14 days (createdAt is ISO string)
    const notifs = await db.query("riderNotifications").collect();
    let notifDel = 0;
    const cut = now - 14 * 24 * 60 * 60 * 1000;
    for (const row of notifs) {
      const ts = Date.parse(String(row.createdAt || "")) || 0;
      if (ts && ts < cut) {
        await db.delete(row._id);
        notifDel += 1;
      }
    }
    deleted.riderNotifications = notifDel;

    return { success: true, deleted };
  },
});

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
