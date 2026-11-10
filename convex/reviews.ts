// convex/reviews.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const CANCELLED_STATUSES = new Set(["cancelled", "canceled"]);

function orderContainsProduct(order: any, productId: string): boolean {
  if (!order?.items?.length || !productId) return false;
  return order.items.some((item: any) => {
    const itemId = String(item.id || item.productId || "");
    return itemId === String(productId);
  });
}

function isEligiblePurchaseOrder(order: any): boolean {
  const status = String(order.orderStatus || order.status || "").toLowerCase().trim();
  if (!status) return false;
  if (CANCELLED_STATUSES.has(status)) return false;
  if (status.includes("cancel")) return false;
  return status === "completed" || status === "delivered";
}

function orderTimeMs(order: any): number {
  if (order.deliveryConfirmedAt) {
    const t = Date.parse(order.deliveryConfirmedAt);
    if (!Number.isNaN(t)) return t;
  }
  return typeof order._creationTime === "number" ? order._creationTime : 0;
}

async function getDeliveredOrdersForProduct(db: any, userEmail: string, productId: string) {
  const orders = await db
    .query("orders")
    .withIndex("by_email", (q: any) => q.eq("email", userEmail))
    .collect();
  return orders
    .filter(
      (order: any) =>
        isEligiblePurchaseOrder(order) && orderContainsProduct(order, productId)
    )
    .sort((a: any, b: any) => orderTimeMs(b) - orderTimeMs(a));
}

async function userHasPurchasedProduct(
  db: any,
  userEmail: string,
  productId: string
): Promise<boolean> {
  const rows = await getDeliveredOrdersForProduct(db, userEmail, productId);
  return rows.length > 0;
}

/** True if user may submit/update a review (bought + first time, or new delivered order after last review). */
async function userCanLeaveReview(
  db: any,
  userEmail: string,
  productId: string
): Promise<{ canReview: boolean; hasReviewed: boolean; reason?: string }> {
  const delivered = await getDeliveredOrdersForProduct(db, userEmail, productId);
  if (!delivered.length) {
    return {
      canReview: false,
      hasReviewed: false,
      reason: "Only customers who received this item can leave a review.",
    };
  }

  const existing = await db
    .query("reviews")
    .withIndex("by_product_user", (q: any) =>
      q.eq("productId", productId).eq("userEmail", userEmail)
    )
    .first();

  if (!existing) {
    return { canReview: true, hasReviewed: false };
  }

  const reviewMs = Date.parse(existing.createdAt) || 0;
  const newerOrder = delivered.some((o: any) => orderTimeMs(o) > reviewMs);
  if (!newerOrder) {
    return {
      canReview: false,
      hasReviewed: true,
      reason: "You already reviewed this item. Order again to leave another review.",
    };
  }
  return { canReview: true, hasReviewed: true };
}

export const getProductReviews = query({
  args: { productId: v.string() },
  handler: async ({ db }, { productId }) => {
    return await db
      .query("reviews")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .order("desc")
      .collect();
  },
});

export const hasUserPurchasedProduct = query({
  args: {
    productId: v.string(),
    userEmail: v.string(),
  },
  handler: async ({ db }, { productId, userEmail }) => {
    return await userHasPurchasedProduct(db, userEmail, productId);
  },
});

export const getReviewEligibility = query({
  args: {
    productId: v.string(),
    userEmail: v.string(),
  },
  handler: async ({ db }, { productId, userEmail }) => {
    return await userCanLeaveReview(db, userEmail, productId);
  },
});

export const submitReview = mutation({
  args: {
    productId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
    rating: v.number(),
    review: v.string(),
  },
  handler: async ({ db }, { productId, userEmail, userName, rating, review }) => {
    const gate = await userCanLeaveReview(db, userEmail, productId);
    if (!gate.canReview) {
      throw new Error(gate.reason || "You cannot review this product right now.");
    }

    const existing = await db
      .query("reviews")
      .withIndex("by_product_user", (q) =>
        q.eq("productId", productId).eq("userEmail", userEmail)
      )
      .first();

    if (existing) {
      // New delivered order after previous review → replace with fresh review
      await db.patch(existing._id, {
        rating,
        review,
        userName,
        createdAt: new Date().toISOString(),
      });
      return { success: true, updated: true };
    }

    await db.insert("reviews", {
      productId,
      userEmail,
      userName,
      rating,
      review,
      createdAt: new Date().toISOString(),
    });
    return { success: true, updated: false };
  },
});

export const deleteReview = mutation({
  args: {
    reviewId: v.id("reviews"),
    userEmail: v.string(),
  },
  handler: async ({ db }, { reviewId, userEmail }) => {
    const review = await db.get(reviewId);
    if (!review) return { success: false, message: "Review not found." };
    if (review.userEmail !== userEmail) return { success: false, message: "Not authorized." };
    await db.delete(reviewId);
    return { success: true };
  },
});
