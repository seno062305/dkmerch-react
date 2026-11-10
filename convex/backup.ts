// convex/backup.ts
import { query, mutation, internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

// ── QUERIES ──────────────────────────────────────────────────────────────────

export const getAllUsers = query({
  handler: async (ctx) => ctx.db.query('users').collect(),
});

export const getAllOrders = query({
  handler: async (ctx) => ctx.db.query('orders').collect(),
});

export const getAllProducts = query({
  handler: async (ctx) => ctx.db.query('products').collect(),
});

export const getAllPromos = query({
  handler: async (ctx) => ctx.db.query('promos').collect(),
});

export const getAllPreOrderRequests = query({
  handler: async (ctx) => ctx.db.query('preOrderRequests').collect(),
});

export const getAllPickupRequests = query({
  handler: async (ctx) => ctx.db.query('pickupRequests').collect(),
});

export const getAllRiderLocations = query({
  handler: async (ctx) => ctx.db.query('riderLocations').collect(),
});

export const getAllReviews = query({
  handler: async (ctx) => ctx.db.query('reviews').collect(),
});

export const getAllRiderApplications = query({
  handler: async (ctx) => ctx.db.query('riderApplications').collect(),
});

export const getAllRiderNotifications = query({
  handler: async (ctx) => ctx.db.query('riderNotifications').collect(),
});

// ── IMPORT MUTATIONS ─────────────────────────────────────────────────────────
// Inserts only records that are NOT already in the live DB (duplicate-safe).
// Fields _id and _creationTime are stripped (Convex auto-generates them).

const strip = (record: Record<string, unknown>) => {
  const { _id, _creationTime, ...rest } = record as any;
  return rest;
};

type DupKeyFn = (r: Record<string, any>) => string;

const importWithDedup = async (
  ctx: any,
  table: string,
  records: any[],
  keyFn: DupKeyFn
) => {
  const existing = await ctx.db.query(table).collect();
  const seen = new Set<string>(existing.map((row: any) => keyFn(row)));
  let inserted = 0;
  let skipped = 0;

  for (const raw of records) {
    const row = strip(raw);
    const key = keyFn(row);
    if (!key || seen.has(key)) {
      skipped += 1;
      continue;
    }
    await ctx.db.insert(table, row);
    seen.add(key);
    inserted += 1;
  }

  return { inserted, skipped, total: records.length };
};

const userKey: DupKeyFn = (r) =>
  String(r.email || '').trim().toLowerCase();

const orderKey: DupKeyFn = (r) =>
  String(r.orderId || '').trim().toLowerCase();

const productKey: DupKeyFn = (r) =>
  [
    String(r.name || '').trim().toLowerCase(),
    String(r.image || '').trim(),
    String(r.kpopGroup || '').trim().toLowerCase(),
    String(r.price ?? ''),
  ].join('|');

const promoKey: DupKeyFn = (r) =>
  String(r.code || '').trim().toLowerCase();

const preOrderKey: DupKeyFn = (r) =>
  `${String(r.userId || '').trim()}|${String(r.productId || '').trim()}`;

const pickupKey: DupKeyFn = (r) =>
  [
    String(r.orderId || '').trim(),
    String(r.riderId || '').trim(),
    String(r.requestedAt || '').trim(),
  ].join('|');

const riderLocationKey: DupKeyFn = (r) =>
  String(r.orderId || '').trim();

const reviewKey: DupKeyFn = (r) =>
  `${String(r.productId || '').trim()}|${String(r.userEmail || '').trim().toLowerCase()}`;

const riderAppKey: DupKeyFn = (r) =>
  String(r.email || '').trim().toLowerCase();

const riderNotifKey: DupKeyFn = (r) =>
  [
    String(r.type || '').trim(),
    String(r.orderId || '').trim(),
    String(r.createdAt || '').trim(),
    String(r.message || '').trim(),
  ].join('|');

export const importUsers = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'users', records, userKey),
});

export const importOrders = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'orders', records, orderKey),
});

export const importProducts = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'products', records, productKey),
});

export const importPromos = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'promos', records, promoKey),
});

export const importPreOrderRequests = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'preOrderRequests', records, preOrderKey),
});

export const importPickupRequests = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'pickupRequests', records, pickupKey),
});

export const importRiderLocations = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'riderLocations', records, riderLocationKey),
});

export const importReviews = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'reviews', records, reviewKey),
});

export const importRiderApplications = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'riderApplications', records, riderAppKey),
});

export const importRiderNotifications = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) =>
    importWithDedup(ctx, 'riderNotifications', records, riderNotifKey),
});

// ── STATUS / CLEAR ───────────────────────────────────────────────────────────

const TABLE_NAMES = [
  'users',
  'orders',
  'products',
  'promos',
  'preOrderRequests',
  'pickupRequests',
  'riderLocations',
  'reviews',
  'riderApplications',
  'riderNotifications',
] as const;

/** Extra live tables mirrored to Firebase (beyond Excel backup set). */
const FIREBASE_EXTRA_TABLES = [
  'cart',
  'wishlist',
  'settings',
  'activityLogs',
  'userPoints',
  'rewardRedemptions',
  'userArchives',
] as const;

/** Snapshot for Convex → Firestore backup mirror. */
export const getAllForFirebaseMirror = internalQuery({
  handler: async (ctx) => {
    const tables: Record<string, any[]> = {};
    for (const name of [...TABLE_NAMES, ...FIREBASE_EXTRA_TABLES]) {
      try {
        tables[name] = await ctx.db.query(name as any).collect();
      } catch {
        tables[name] = [];
      }
    }
    return tables;
  },
});

export const recordFirebaseSyncResult = internalMutation({
  args: {
    ok: v.boolean(),
    message: v.string(),
    synced: v.optional(v.number()),
    failed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('settings').first();
    const payload = {
      lastFirebaseSyncAt: Date.now(),
      lastFirebaseSyncOk: args.ok,
      lastFirebaseSyncMessage: args.message.slice(0, 500),
      lastFirebaseSyncCount: args.synced ?? 0,
      lastFirebaseSyncFailed: args.failed ?? 0,
    } as any;
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert('settings', {
        storeName: 'DKMerch Store',
        ...payload,
      });
    }
    await ctx.db.insert('activityLogs', {
      action: 'firebase_sync',
      actorRole: 'system',
      actorName: 'Firebase Mirror',
      details: args.message.slice(0, 300),
      createdAt: Date.now(),
    });
  },
});

export const getFirebaseSyncStatus = query({
  handler: async (ctx) => {
    const settings = (await ctx.db.query('settings').first()) as any;
    return {
      lastFirebaseSyncAt: settings?.lastFirebaseSyncAt ?? null,
      lastFirebaseSyncOk: settings?.lastFirebaseSyncOk ?? null,
      lastFirebaseSyncMessage: settings?.lastFirebaseSyncMessage ?? null,
      lastFirebaseSyncCount: settings?.lastFirebaseSyncCount ?? 0,
      lastFirebaseSyncFailed: settings?.lastFirebaseSyncFailed ?? 0,
    };
  },
});

export const getDatabaseStatus = query({
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    const slices: { key: string; label: string; count: number; bytes: number }[] = [];
    let total = 0;
    let totalBytes = 0;
    const encoder = new TextEncoder();
    for (const name of TABLE_NAMES) {
      const rows = await ctx.db.query(name).collect();
      const count = rows.length;
      const bytes = encoder.encode(JSON.stringify(rows)).length;
      counts[name] = count;
      total += count;
      totalBytes += bytes;
      slices.push({ key: name, label: name, count, bytes });
    }
    slices.sort((a, b) => b.bytes - a.bytes);
    const settings = await ctx.db.query('settings').first();
    const backups = await ctx.db.query('systemBackups').order('desc').take(30);
    let archiveCount = 0;
    try {
      archiveCount = (await ctx.db.query('systemArchives').collect()).length;
    } catch {
      archiveCount = 0;
    }

    // OTP / temp auth docs (DKMerch equivalent of SDO "OTP sessions")
    let otpSessions = 0;
    try {
      const pending = await ctx.db.query('pendingUsers').collect();
      const users = await ctx.db.query('users').collect();
      otpSessions =
        pending.filter((p: any) => p.otp || p.token).length +
        users.filter((u: any) => u.reactivationOtp).length;
    } catch {
      otpSessions = 0;
    }

    return {
      ok: true,
      provider: 'convex',
      counts,
      slices,
      total,
      totalBytes,
      tableCount: TABLE_NAMES.length,
      checkedAt: Date.now(),
      autoBackupSchedule: settings?.autoBackupSchedule || 'off',
      lastAutoBackupAt: settings?.lastAutoBackupAt ?? null,
      lastRestoreAt: settings?.lastRestoreAt ?? null,
      backupCount: backups.length,
      archiveCount,
      otpSessions,
    };
  },
});

export const listSystemBackups = query({
  handler: async (ctx) => {
    return await ctx.db.query('systemBackups').order('desc').take(30);
  },
});

export const listSystemArchives = query({
  handler: async (ctx) => {
    return await ctx.db.query('systemArchives').order('desc').take(30);
  },
});

export const getBackupFileUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

const assertAdminPassword = async (ctx: any, adminId: any, password: string) => {
  const admin = await ctx.db.get(adminId);
  if (!admin || admin.role !== 'admin') {
    return { ok: false as const, message: 'Admin account required.' };
  }
  if (admin.password !== password) {
    return { ok: false as const, message: 'Incorrect password.' };
  }
  return { ok: true as const, admin };
};

export const generateBackupUploadUrl = mutation({
  args: {
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { adminId, password }) => {
    const auth = await assertAdminPassword(ctx, adminId, password);
    if (!auth.ok) return { success: false, message: auth.message };
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { success: true, uploadUrl };
  },
});

/** Record a manual Create backup (Excel saved to Convex file storage + history). */
export const recordManualBackup = mutation({
  args: {
    adminId: v.id('users'),
    password: v.string(),
    storageId: v.id('_storage'),
    name: v.string(),
    recordCount: v.number(),
    sizeBytes: v.number(),
    tables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await assertAdminPassword(ctx, args.adminId, args.password);
    if (!auth.ok) return { success: false, message: auth.message };
    const now = Date.now();
    await ctx.db.insert('systemBackups', {
      name: args.name,
      createdAt: now,
      recordCount: args.recordCount,
      sizeBytes: args.sizeBytes,
      tables: args.tables,
      storageId: args.storageId,
      createdBy: auth.admin.email,
      kind: 'backup',
    });
    const settings = await ctx.db.query('settings').first();
    if (settings) {
      await ctx.db.patch(settings._id, { lastAutoBackupAt: now });
    } else {
      await ctx.db.insert('settings', {
        storeName: 'DKMerch Store',
        lastAutoBackupAt: now,
      });
    }
    const all = await ctx.db.query('systemBackups').order('desc').collect();
    for (const old of all.slice(30)) {
      if (old.storageId) await ctx.storage.delete(old.storageId);
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert('activityLogs', {
      action: 'backup_create',
      actorEmail: auth.admin.email,
      actorName: auth.admin.name,
      actorRole: 'admin',
      details: `${args.name} · ${args.recordCount} records · ${args.sizeBytes} bytes`,
      createdAt: now,
    });
    return { success: true, createdAt: now };
  },
});

export const markRestoreCompleted = mutation({
  args: {
    adminId: v.id('users'),
    password: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, { adminId, password, details }) => {
    const auth = await assertAdminPassword(ctx, adminId, password);
    if (!auth.ok) return { success: false, message: auth.message };
    const now = Date.now();
    const settings = await ctx.db.query('settings').first();
    if (settings) {
      await ctx.db.patch(settings._id, { lastRestoreAt: now });
    } else {
      await ctx.db.insert('settings', {
        storeName: 'DKMerch Store',
        lastRestoreAt: now,
      });
    }
    await ctx.db.insert('activityLogs', {
      action: 'backup_restore',
      actorEmail: auth.admin.email,
      actorName: auth.admin.name,
      actorRole: 'admin',
      details: details || 'Import/restore completed (duplicates skipped)',
      createdAt: now,
    });
    return { success: true };
  },
});

/** Move live table rows into an archive package, then remove them from live DB. */
export const archiveTable = mutation({
  args: {
    table: v.string(),
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { table, adminId, password }) => {
    if (!(TABLE_NAMES as readonly string[]).includes(table)) {
      return { success: false, message: 'Unknown table.' };
    }
    const auth = await assertAdminPassword(ctx, adminId, password);
    if (!auth.ok) return { success: false, message: auth.message };

    const rows = await ctx.db.query(table as any).collect();
    const payload = JSON.stringify({
      version: 1,
      kind: 'dkmerch-table-archive',
      table,
      createdAt: new Date().toISOString(),
      records: rows,
    });
    const sizeBytes = new TextEncoder().encode(payload).length;
    const storageId = await ctx.storage.store(
      new Blob([payload], { type: 'application/json' })
    );
    const now = Date.now();
    const name = `archive-${table}-${new Date(now).toISOString().slice(0, 10)}`;
    await ctx.db.insert('systemArchives', {
      name,
      tableName: table,
      createdAt: now,
      createdBy: auth.admin.email,
      recordCount: rows.length,
      sizeBytes,
      storageId,
    });
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.insert('activityLogs', {
      action: 'table_archive',
      actorEmail: auth.admin.email,
      actorName: auth.admin.name,
      actorRole: 'admin',
      details: `Archived ${rows.length} from ${table}`,
      createdAt: now,
    });
    return { success: true, archived: rows.length, name };
  },
});

/** Permanently wipe a live table (no archive). */
export const clearTable = mutation({
  args: {
    table: v.string(),
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { table, adminId, password }) => {
    if (!(TABLE_NAMES as readonly string[]).includes(table)) {
      return { success: false, message: 'Unknown table.' };
    }
    const auth = await assertAdminPassword(ctx, adminId, password);
    if (!auth.ok) return { success: false, message: auth.message };
    const rows = await ctx.db.query(table as any).collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.insert('activityLogs', {
      action: 'table_wipe',
      actorEmail: auth.admin.email,
      actorName: auth.admin.name,
      actorRole: 'admin',
      details: `Permanently deleted ${rows.length} from ${table}`,
      createdAt: Date.now(),
    });
    return { success: true, deleted: rows.length };
  },
});

/** Permanently delete an archive package (+ file). */
export const permanentDeleteArchive = mutation({
  args: {
    archiveId: v.id('systemArchives'),
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { archiveId, adminId, password }) => {
    const auth = await assertAdminPassword(ctx, adminId, password);
    if (!auth.ok) return { success: false, message: auth.message };
    const row = await ctx.db.get(archiveId);
    if (!row) return { success: false, message: 'Archive not found.' };
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.delete(archiveId);
    await ctx.db.insert('activityLogs', {
      action: 'archive_permanent_delete',
      actorEmail: auth.admin.email,
      actorName: auth.admin.name,
      actorRole: 'admin',
      details: `Permanently deleted archive ${row.name}`,
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

export const setAutoBackupSchedule = mutation({
  args: {
    schedule: v.string(),
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { schedule, adminId, password }) => {
    const allowed = ['daily', 'weekly', 'off'];
    if (!allowed.includes(schedule)) {
      return { success: false, message: 'Invalid schedule.' };
    }
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== 'admin') {
      return { success: false, message: 'Admin account required.' };
    }
    if (admin.password !== password) {
      return { success: false, message: 'Incorrect password.' };
    }
    const existing = await ctx.db.query('settings').first();
    if (existing) {
      await ctx.db.patch(existing._id, { autoBackupSchedule: schedule });
    } else {
      await ctx.db.insert('settings', {
        storeName: 'DKMerch Store',
        autoBackupSchedule: schedule,
      });
    }
    await ctx.db.insert('activityLogs', {
      action: 'auto_backup_schedule',
      actorEmail: admin.email,
      actorName: admin.name,
      actorRole: 'admin',
      details: `Schedule set to ${schedule}`,
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

/** Internal: snapshot all tables into systemBackups (+ file storage). Keeps last 30. */
export const runAutoBackup = internalMutation({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, { reason }) => {
    const settings = await ctx.db.query('settings').first();
    const schedule = settings?.autoBackupSchedule || 'off';
    const isManual = reason === 'manual';

    if (!isManual) {
      if (schedule === 'off') return { skipped: true };
      if (schedule === 'weekly') {
        // Cron is daily; only proceed on Mondays (UTC) for weekly mode.
        if (new Date().getUTCDay() !== 1) return { skipped: true };
      }
      // Avoid duplicate same-day snapshots
      if (settings?.lastAutoBackupAt) {
        const last = new Date(settings.lastAutoBackupAt);
        const now = new Date();
        if (
          last.getUTCFullYear() === now.getUTCFullYear() &&
          last.getUTCMonth() === now.getUTCMonth() &&
          last.getUTCDate() === now.getUTCDate()
        ) {
          return { skipped: true, reason: 'already-backed-up-today' };
        }
      }
    }

    const tables: Record<string, unknown[]> = {};
    let recordCount = 0;
    for (const name of TABLE_NAMES) {
      const rows = await ctx.db.query(name).collect();
      tables[name] = rows;
      recordCount += rows.length;
    }

    const payload = JSON.stringify({
      version: 1,
      kind: 'dkmerch-convex-backup',
      createdAt: new Date().toISOString(),
      schedule,
      reason: reason || 'scheduled',
      tables,
    });
    const sizeBytes = new TextEncoder().encode(payload).length;
    const blob = new Blob([payload], { type: 'application/json' });
    const storageId = await ctx.storage.store(blob);

    const now = Date.now();
    const name = `auto-${new Date(now).toISOString().slice(0, 10)}`;
    await ctx.db.insert('systemBackups', {
      name,
      schedule,
      createdAt: now,
      recordCount,
      sizeBytes,
      tables: [...TABLE_NAMES],
      storageId,
      createdBy: reason || 'cron',
    });

    if (settings) {
      await ctx.db.patch(settings._id, { lastAutoBackupAt: now });
    } else {
      await ctx.db.insert('settings', {
        storeName: 'DKMerch Store',
        autoBackupSchedule: schedule,
        lastAutoBackupAt: now,
      });
    }

    // Keep last 30
    const all = await ctx.db.query('systemBackups').order('desc').collect();
    for (const old of all.slice(30)) {
      if (old.storageId) await ctx.storage.delete(old.storageId);
      await ctx.db.delete(old._id);
    }

    await ctx.db.insert('activityLogs', {
      action: 'auto_backup',
      actorRole: 'system',
      actorName: 'Convex Cron',
      details: `${name} · ${recordCount} records · ${sizeBytes} bytes`,
      createdAt: now,
    });

    return { success: true, recordCount, sizeBytes };
  },
});

export const triggerManualSystemBackup = mutation({
  args: {
    adminId: v.id('users'),
    password: v.string(),
  },
  handler: async (ctx, { adminId, password }) => {
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== 'admin') {
      return { success: false, message: 'Admin account required.' };
    }
    if (admin.password !== password) {
      return { success: false, message: 'Incorrect password.' };
    }
    // Schedule immediate internal run via scheduler
    await ctx.scheduler.runAfter(0, internal.backup.runAutoBackup, { reason: 'manual' });
    return { success: true };
  },
});