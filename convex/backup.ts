// convex/backup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Backup query functions — expose all table data for the backup script.
// These use internalQuery so only your Deploy Key can call them.
// ─────────────────────────────────────────────────────────────────────────────

import { internalQuery } from './_generated/server';

export const getAllUsers = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('users').collect();
  },
});

export const getAllOrders = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('orders').collect();
  },
});

export const getAllProducts = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('products').collect();
  },
});

export const getAllPromos = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('promos').collect();
  },
});

export const getAllPreOrderRequests = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('preOrderRequests').collect();
  },
});

export const getAllPickupRequests = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('pickupRequests').collect();
  },
});

export const getAllRiderLocations = internalQuery({
  handler: async (ctx) => {
    return await ctx.db.query('riderLocations').collect();
  },
});