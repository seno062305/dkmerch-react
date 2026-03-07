// convex/backup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Backup query functions — expose all table data for the backup script.
// Uses regular query (not internalQuery) so the Deploy Key can call via HTTP API.
// ─────────────────────────────────────────────────────────────────────────────

import { query } from './_generated/server';

export const getAllUsers = query({
  handler: async (ctx) => {
    return await ctx.db.query('users').collect();
  },
});

export const getAllOrders = query({
  handler: async (ctx) => {
    return await ctx.db.query('orders').collect();
  },
});

export const getAllProducts = query({
  handler: async (ctx) => {
    return await ctx.db.query('products').collect();
  },
});

export const getAllPromos = query({
  handler: async (ctx) => {
    return await ctx.db.query('promos').collect();
  },
});

export const getAllPreOrderRequests = query({
  handler: async (ctx) => {
    return await ctx.db.query('preOrderRequests').collect();
  },
});

export const getAllPickupRequests = query({
  handler: async (ctx) => {
    return await ctx.db.query('pickupRequests').collect();
  },
});

export const getAllRiderLocations = query({
  handler: async (ctx) => {
    return await ctx.db.query('riderLocations').collect();
  },
});