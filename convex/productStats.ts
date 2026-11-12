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

/** Batch sold counts for home / shop product cards. */
export const getSoldCountsForProducts = query({
  args: { productIds: v.array(v.string()) },
  handler: async ({ db }, { productIds }) => {
    const ids = (productIds || []).map((id) => String(id)).filter(Boolean).slice(0, 40);
    const out: Record<string, number> = {};
    for (const id of ids) out[id] = 0;
    if (!ids.length) return out;

    const wanted = new Set(ids);
    const orders = await db.query("orders").collect();
    for (const order of orders) {
      if (!countsTowardSold(order)) continue;
      for (const item of order.items || []) {
        const id = String(item.id || item.productId || "");
        if (!wanted.has(id)) continue;
        out[id] = (out[id] || 0) + (Number(item.quantity || item.qty || 1) || 0);
      }
    }
    return out;
  },
});

/** Average rating + review count for many products (home / shop card teasers). */
export const getLatestReviewsForProducts = query({
  args: { productIds: v.array(v.string()) },
  handler: async ({ db }, { productIds }) => {
    const ids = (productIds || []).map((id) => String(id)).filter(Boolean).slice(0, 40);
    const out: Record<
      string,
      { rating: number; review: string; userName: string; count: number }
    > = {};
    for (const productId of ids) {
      const rows = await db
        .query("reviews")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .order("desc")
        .collect();
      if (!rows.length) continue;
      const sum = rows.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
      const avg = sum / rows.length;
      // rating = average across all reviews (matches product modal); text from latest.
      const latest = rows[0];
      out[productId] = {
        rating: Math.round(avg * 10) / 10,
        review: latest?.review || "",
        userName: latest?.userName || "Customer",
        count: rows.length,
      };
    }
    return out;
  },
});
