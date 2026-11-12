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

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

async function getDeliveredOrdersForProduct(db: any, userEmail: string, productId: string) {
  const key = normalizeEmail(userEmail);
  const orders = await db
    .query("orders")
    .withIndex("by_email", (q: any) => q.eq("email", key))
    .collect();
  // Also try raw email if stored with different casing
  const extras =
    key !== String(userEmail || "").trim()
      ? await db
          .query("orders")
          .withIndex("by_email", (q: any) => q.eq("email", String(userEmail || "").trim()))
          .collect()
      : [];
  const merged = [...orders];
  for (const o of extras) {
    if (!merged.some((x) => String(x._id) === String(o._id))) merged.push(o);
  }
  return merged
    .filter(
      (order: any) =>
        isEligiblePurchaseOrder(order) && orderContainsProduct(order, productId)
    )
    .sort((a: any, b: any) => orderTimeMs(a) - orderTimeMs(b)); // oldest first
}

async function getUserReviewsForProduct(db: any, userEmail: string, productId: string) {
  const key = normalizeEmail(userEmail);
  const rows = await db
    .query("reviews")
    .withIndex("by_product_user", (q: any) =>
      q.eq("productId", productId).eq("userEmail", key)
    )
    .collect();
  // Legacy rows may store mixed-case email
  const legacy = await db
    .query("reviews")
    .withIndex("by_product_user", (q: any) =>
      q.eq("productId", productId).eq("userEmail", String(userEmail || "").trim())
    )
    .collect();
  const map = new Map<string, any>();
  for (const r of [...rows, ...legacy]) map.set(String(r._id), r);
  return [...map.values()].sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)
  );
}

/** True if user may submit another review (one per delivered order). */
async function userCanLeaveReview(
  db: any,
  userEmail: string,
  productId: string
): Promise<{
  canReview: boolean;
  hasReviewed: boolean;
  reason?: string;
  nextOrderId?: string;
}> {
  const delivered = await getDeliveredOrdersForProduct(db, userEmail, productId);
  if (!delivered.length) {
    return {
      canReview: false,
      hasReviewed: false,
      reason: "Only customers who received this item can leave a review.",
    };
  }

  const existing = await getUserReviewsForProduct(db, userEmail, productId);
  const reviewedOrderIds = new Set(
    existing.map((r) => String(r.orderId || "")).filter(Boolean)
  );

  // Prefer matching by orderId; fall back to count for legacy reviews without orderId
  let unreviewed = delivered.filter((o) => !reviewedOrderIds.has(String(o.orderId)));
  if (existing.some((r) => !r.orderId)) {
    const legacySlots = existing.filter((r) => !r.orderId).length;
    unreviewed = unreviewed.slice(legacySlots);
  }

  if (!unreviewed.length) {
    return {
      canReview: false,
      hasReviewed: existing.length > 0,
      reason: "You already reviewed this item for your delivered orders. Order again to leave another review.",
    };
  }

  return {
    canReview: true,
    hasReviewed: existing.length > 0,
    nextOrderId: String(unreviewed[0].orderId || ""),
  };
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
    const rows = await getDeliveredOrdersForProduct(db, userEmail, productId);
    return rows.length > 0;
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
    const email = normalizeEmail(userEmail);
    const gate = await userCanLeaveReview(db, email, productId);
    if (!gate.canReview) {
      throw new Error(gate.reason || "You cannot review this product right now.");
    }

    // Always insert a new review so multiple orders from the same user all show
    await db.insert("reviews", {
      productId,
      userEmail: email,
      userName,
      rating,
      review,
      createdAt: new Date().toISOString(),
      orderId: gate.nextOrderId || undefined,
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
    const row = await db.get(reviewId);
    if (!row) return { success: false, message: "Review not found." };
    if (normalizeEmail(row.userEmail) !== normalizeEmail(userEmail)) {
      return { success: false, message: "Not authorized." };
    }
    await db.delete(reviewId);
    return { success: true };
  },
});
