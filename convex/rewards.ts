// convex/rewards.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const getPointsForTotal = (total: number): number => {
  if (total < 1000)              return 5;
  if (total >= 1000 && total < 2000) return 10;
  if (total >= 2000 && total < 3000) return 15;
  if (total >= 3000 && total < 5000) return 20;
  return 25;
};

const REWARD_COSTS: Record<string, number> = {
  album:       100,
  photocard:   120,
  lightstick:  140,
  accessories: 150,
};

const REWARD_CATEGORY_MAP: Record<string, string> = {
  album:       'Album',
  photocard:   'Photocard',
  lightstick:  'Lightstick',
  accessories: 'Accessories',
};

const genTicketCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TKT-';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

export const getUserPoints = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db
      .query("userPoints")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
  },
});

export const getAllUserPoints = query({
  handler: async ({ db }) => {
    return await db.query("userPoints").collect();
  },
});

export const awardPointsForOrder = mutation({
  args: {
    email:      v.string(),
    userName:   v.string(),
    orderId:    v.string(),
    orderTotal: v.number(),
  },
  handler: async ({ db }, { email, userName, orderId, orderTotal }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
    if (!order || order.pointsAwarded) return { success: false, reason: "already_awarded" };

    const points = getPointsForTotal(orderTotal);
    const now    = new Date().toISOString();

    const existing = await db
      .query("userPoints")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (existing) {
      await db.patch(existing._id, {
        totalPoints: existing.totalPoints + points,
        history: [
          { orderId, points, orderTotal, earnedAt: now },
          ...existing.history,
        ],
      });
    } else {
      await db.insert("userPoints", {
        email,
        userName,
        totalPoints: points,
        history: [{ orderId, points, orderTotal, earnedAt: now }],
      });
    }

    await db.patch(order._id, { pointsAwarded: true });
    return { success: true, pointsAwarded: points };
  },
});

export const redeemPoints = mutation({
  args: {
    email:      v.string(),
    userName:   v.string(),
    rewardType: v.string(),
  },
  handler: async ({ db }, { email, userName, rewardType }) => {
    const cost = REWARD_COSTS[rewardType];
    if (!cost) return { success: false, reason: "invalid_reward_type" };

    const userPts = await db
      .query("userPoints")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!userPts || userPts.totalPoints < cost) {
      return { success: false, reason: "insufficient_points" };
    }

    const ticketCode = genTicketCode();
    const now        = new Date().toISOString();

    await db.patch(userPts._id, {
      totalPoints: userPts.totalPoints - cost,
    });

    await db.insert("rewardRedemptions", {
      email,
      userName,
      rewardType,
      pointsSpent:          cost,
      status:               "redeemed",
      requestedAt:          now,
      ticketCode,
      selectedProductId:    undefined,
      selectedProductName:  undefined,
      selectedProductImage: undefined,
      selectedProductGroup: undefined,
      productSelectedAt:    undefined,
      checkedOutOrderId:    undefined,
      checkedOutAt:         undefined,
    });

    return { success: true, ticketCode };
  },
});

export const getUserRedemptions = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db
      .query("rewardRedemptions")
      .withIndex("by_email", q => q.eq("email", email))
      .order("desc")
      .collect();
  },
});

export const getAllRedemptions = query({
  handler: async ({ db }) => {
    return await db.query("rewardRedemptions").order("desc").collect();
  },
});

export const getProductsByRewardType = query({
  args: { rewardType: v.string() },
  handler: async ({ db }, { rewardType }) => {
    const category = REWARD_CATEGORY_MAP[rewardType];
    if (!category) return [];
    return await db
      .query("products")
      .filter(q =>
        q.and(
          q.eq(q.field("category"), category),
          q.neq(q.field("status"), "archived")
        )
      )
      .collect();
  },
});

export const selectProductForTicket = mutation({
  args: {
    ticketCode:           v.string(),
    selectedProductId:    v.string(),
    selectedProductName:  v.string(),
    selectedProductImage: v.string(),
    selectedProductGroup: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const redemption = await db
      .query("rewardRedemptions")
      .filter(q => q.eq(q.field("ticketCode"), args.ticketCode))
      .first();

    if (!redemption) return { success: false, reason: "ticket_not_found" };
    if (redemption.selectedProductId) return { success: false, reason: "already_selected" };

    await db.patch(redemption._id, {
      selectedProductId:    args.selectedProductId,
      selectedProductName:  args.selectedProductName,
      selectedProductImage: args.selectedProductImage,
      selectedProductGroup: args.selectedProductGroup,
      productSelectedAt:    new Date().toISOString(),
    });

    return { success: true };
  },
});

// ── Mark ticket as checked out (linked to an order) ───────────────────────────
export const markTicketCheckedOut = mutation({
  args: {
    ticketCode:        v.string(),
    checkedOutOrderId: v.string(),
  },
  handler: async ({ db }, { ticketCode, checkedOutOrderId }) => {
    const redemption = await db
      .query("rewardRedemptions")
      .filter(q => q.eq(q.field("ticketCode"), ticketCode))
      .first();

    if (!redemption) return { success: false };

    await db.patch(redemption._id, {
      checkedOutOrderId,
      checkedOutAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

export const getAllUserPointsBackup = query({
  handler: async ({ db }) => db.query("userPoints").collect(),
});

export const getAllRedemptionsBackup = query({
  handler: async ({ db }) => db.query("rewardRedemptions").collect(),
});