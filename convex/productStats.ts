import { query } from "./_generated/server";
import { v } from "convex/values";

const COUNTED = new Set([
  "confirmed",
  "shipped",
  "out_for_delivery",
  "completed",
  "delivered",
  "processing",
]);

function countsTowardSold(order: any): boolean {
  const st = String(order.orderStatus || order.status || "").toLowerCase().trim();
  if (!st || st.includes("cancel")) return false;
  if (order.paymentStatus === "paid") return true;
  if (COUNTED.has(st)) return true;
  if (st === "delivered" || st.includes("deliver")) return true;
  return false;
}

/** How many units of a product have been sold (paid / in-fulfillment / delivered). */
export const getProductSoldCount = query({
  args: { productId: v.string() },
  handler: async ({ db }, { productId }) => {
    const pid = String(productId || "").trim();
    if (!pid) return 0;
    const orders = await db.query("orders").collect();
    let sold = 0;
    for (const order of orders) {
      if (!countsTowardSold(order)) continue;
      for (const item of order.items || []) {
        const id = String(item.id || item.productId || "");
        if (id === pid) sold += Number(item.quantity || item.qty || 1) || 0;
      }
    }
    return sold;
  },
});

/** Latest reviews for many products (home / shop teasers). */
export const getLatestReviewsForProducts = query({
  args: { productIds: v.array(v.string()) },
  handler: async ({ db }, { productIds }) => {
    const ids = (productIds || []).map((id) => String(id)).filter(Boolean).slice(0, 40);
    const out: Record<string, { rating: number; review: string; userName: string; count: number }> = {};
    for (const productId of ids) {
      const rows = await db
        .query("reviews")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .order("desc")
        .take(20);
      if (!rows.length) continue;
      out[productId] = {
        rating: rows[0].rating,
        review: rows[0].review || "",
        userName: rows[0].userName || "Customer",
        count: rows.length,
      };
    }
    return out;
  },
});
