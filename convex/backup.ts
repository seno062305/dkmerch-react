// convex/backup.ts
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

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
// Each mutation accepts an array of records and inserts them into the DB.
// Fields _id and _creationTime are stripped (Convex auto-generates them).

const strip = (record: Record<string, unknown>) => {
  const { _id, _creationTime, ...rest } = record as any;
  return rest;
};

export const importUsers = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('users', strip(r));
    return records.length;
  },
});

export const importOrders = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('orders', strip(r));
    return records.length;
  },
});

export const importProducts = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('products', strip(r));
    return records.length;
  },
});

export const importPromos = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('promos', strip(r));
    return records.length;
  },
});

export const importPreOrderRequests = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('preOrderRequests', strip(r));
    return records.length;
  },
});

export const importPickupRequests = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('pickupRequests', strip(r));
    return records.length;
  },
});

export const importRiderLocations = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('riderLocations', strip(r));
    return records.length;
  },
});

export const importReviews = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('reviews', strip(r));
    return records.length;
  },
});

export const importRiderApplications = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('riderApplications', strip(r));
    return records.length;
  },
});

export const importRiderNotifications = mutation({
  args: { records: v.array(v.any()) },
  handler: async (ctx, { records }) => {
    for (const r of records) await ctx.db.insert('riderNotifications', strip(r));
    return records.length;
  },
});