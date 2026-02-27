// convex/reviews.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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