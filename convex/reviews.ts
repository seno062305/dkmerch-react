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
  // Only delivered / completed purchases can leave a review
  return (
    status === "completed" ||
    status === "delivered" ||
    status === "Delivered".toLowerCase()
  );
}

async function userHasPurchasedProduct(
  db: any,
  userEmail: string,
  productId: string
): Promise<boolean> {
  if (!userEmail || !productId) return false;
  const orders = await db
    .query("orders")
    .withIndex("by_email", (q: any) => q.eq("email", userEmail))
    .collect();

  return orders.some(
    (order: any) =>
      isEligiblePurchaseOrder(order) && orderContainsProduct(order, productId)
  );
}

// ── GET: All reviews for a specific product ──
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

// ── GET: Whether the logged-in user bought this product ──
export const hasUserPurchasedProduct = query({
  args: {
    productId: v.string(),
    userEmail: v.string(),
  },
  handler: async ({ db }, { productId, userEmail }) => {
    return await userHasPurchasedProduct(db, userEmail, productId);
  },
});

// ── MUTATION: Submit or update a review ──
export const submitReview = mutation({
  args: {
    productId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
    rating: v.number(),
    review: v.string(),
  },
  handler: async ({ db }, { productId, userEmail, userName, rating, review }) => {
    const purchased = await userHasPurchasedProduct(db, userEmail, productId);
    if (!purchased) {
      throw new Error("You can only review products you have purchased.");
    }

    // Check if user already reviewed this product
    const existing = await db
      .query("reviews")
      .withIndex("by_product_user", (q) =>
        q.eq("productId", productId).eq("userEmail", userEmail)
      )
      .first();

    if (existing) {
      // Update existing review
      await db.patch(existing._id, {
        rating,
        review,
        createdAt: new Date().toISOString(),
      });
      return { success: true, updated: true };
    }

    // Insert new review
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

// ── MUTATION: Delete a review (only by the reviewer) ──
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