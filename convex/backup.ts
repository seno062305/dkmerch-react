// convex/backup.ts
import { query } from './_generated/server';

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