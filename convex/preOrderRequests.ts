// convex/preOrderRequests.ts
import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ── INTERNAL QUERY: Declared FIRST para ma-reference ng checkAndReleasePreOrders ──
export const getAllPendingPreOrders = internalQuery({
  args: {},
  handler: async ({ db }) => {
    return await db
      .query("preOrderRequests")
      .filter((q) => q.eq(q.field("isAvailable"), false))
      .collect();
  },
});

// ── GET: All pre-order requests ng isang user ──────────────────────────────
export const getMyPreOrders = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const requests = await db
      .query("preOrderRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const withProducts = await Promise.all(
      requests.map(async (req) => {
        const product = await db
          .query("products")
          .filter((q) => q.eq(q.field("_id"), req.productId as any))
          .first();
        return { ...req, product };
      })
    );

    // Sort: available first, then by preOrderedAt descending
    return withProducts.sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return new Date(b.preOrderedAt).getTime() - new Date(a.preOrderedAt).getTime();
    });
  },
});

// ── GET: Check kung may available na pre-order si user (for badge) ──────────
export const hasAvailablePreOrder = query({
  args: { userId: v.string() },
  handler: async ({ db }, { userId }) => {
    const available = await db
      .query("preOrderRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("isAvailable"), true))
      .filter((q) => q.eq(q.field("addedToCart"), false))
      .first();
    return !!available;
  },
});

// ── GET: Check kung naka-pre-order na ng user yung product (per releaseTime) ─
// ✅ FIX: Checks by userId + productId + releaseTime
// Kapag nag-change ang releaseTime ng product, pwede ulit mag-pre-order
export const isProductPreOrdered = query({
  args: { userId: v.string(), productId: v.string(), releaseTime: v.optional(v.string()) },
  handler: async ({ db }, { userId, productId, releaseTime }) => {
    const all = await db
      .query("preOrderRequests")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .collect();

    if (all.length === 0) return false;

    // If releaseTime provided, check if any existing record matches same releaseTime
    if (releaseTime) {
      return all.some((r) => r.releaseTime === releaseTime);
    }

    // Fallback: any existing pre-order for this product
    return all.length > 0;
  },
});

// ── MUTATION: Mag pre-order ng product ───────────────────────────────────
export const placePreOrder = mutation({
  args: {
    userId: v.string(),
    productId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
  },
  handler: async ({ db }, { userId, productId, userEmail, userName }) => {
    const product = await db
      .query("products")
      .filter((q) => q.eq(q.field("_id"), productId as any))
      .first();

    if (!product) {
      return { success: false, message: "Product not found." };
    }

    const rd = product.releaseDate || "";
    const rt = (product as any).releaseTime || "00:00";

    // ✅ FIX: Check duplicate by userId + productId + releaseTime (same slot)
    // Different releaseTime = different pre-order slot = allowed
    const existing = await db
      .query("preOrderRequests")
      .withIndex("by_user_product", (q) =>
        q.eq("userId", userId).eq("productId", productId)
      )
      .filter((q) => q.eq(q.field("releaseTime"), rt))
      .first();

    if (existing) {
      return { success: false, message: "You already pre-ordered this item for this release slot." };
    }

    // ✅ Compute UTC ms from PHT (UTC+8) release date+time
    let releaseTimestampMs = 0;
    if (rd && rt) {
      const [h, m] = rt.split(":").map(Number);
      const [yr, mo, dy] = rd.split("-").map(Number);
      releaseTimestampMs = Date.UTC(yr, mo - 1, dy, h - 8, m, 0);
    }

    await db.insert("preOrderRequests", {
      userId,
      productId,
      userEmail,
      userName,
      productName: product.name,
      productImage: product.image,
      productPrice: product.price,
      releaseDate: rd,
      releaseTime: rt,
      releaseTimestampMs,
      isAvailable: false,
      addedToCart: false,
      notifiedAt: null,
      preOrderedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// ── MUTATION: Mark as addedToCart kapag na-add na sa cart ────────────────
export const markPreOrderAddedToCart = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, { addedToCart: true });
    return { success: true };
  },
});

// ── MUTATION: Remove/Cancel pre-order ────────────────────────────────────
export const removePreOrder = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.delete(requestId);
    return { success: true };
  },
});

// ── MUTATION: Cancel pre-order (alias) ───────────────────────────────────
export const cancelPreOrder = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.delete(requestId);
    return { success: true };
  },
});

// ── INTERNAL MUTATION: Mark as available + set notifiedAt ────────────────
export const markPreOrderAvailable = internalMutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, {
      isAvailable: true,
      notifiedAt: new Date().toISOString(),
    });
  },
});

// ── INTERNAL ACTION: I-check lahat ng pre-orders at i-release kung due na ─
export const checkAndReleasePreOrders = internalAction({
  args: {},
  handler: async (ctx) => {
    // ✅ Convex server time — hindi madadaya ng device ng user
    const nowMs = Date.now();

    const pendingRequests: any[] = await ctx.runQuery(
      internal.preOrderRequests.getAllPendingPreOrders,
      {}
    );

    for (const req of pendingRequests) {
      if (!req.releaseDate || !req.releaseTime) continue;

      let releaseMs: number;
      if (req.releaseTimestampMs) {
        releaseMs = req.releaseTimestampMs;
      } else {
        const [h, m] = req.releaseTime.split(":").map(Number);
        const [yr, mo, dy] = req.releaseDate.split("-").map(Number);
        releaseMs = Date.UTC(yr, mo - 1, dy, h - 8, m, 0);
      }

      if (nowMs >= releaseMs) {
        await ctx.runMutation(internal.preOrderRequests.markPreOrderAvailable, {
          requestId: req._id,
        });

        await ctx.runAction(internal.preOrderRequests.sendPreOrderAvailableEmail, {
          to: req.userEmail,
          userName: req.userName,
          productName: req.productName,
          productImage: req.productImage,
          productPrice: req.productPrice,
        });
      }
    }
  },
});

// ── INTERNAL ACTION: Mag-send ng email notification ──────────────────────
export const sendPreOrderAvailableEmail = internalAction({
  args: {
    to: v.string(),
    userName: v.string(),
    productName: v.string(),
    productImage: v.string(),
    productPrice: v.number(),
  },
  handler: async (ctx, { to, userName, productName, productImage, productPrice }) => {
    const SITE_URL = process.env.SITE_URL || "https://dkmerchwebsite.vercel.app";

    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.12);">
        <div style="background: linear-gradient(135deg, #fc1268, #9c27b0); padding: 36px 32px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
          <h1 style="color: white; margin: 0 0 8px; font-size: 26px; font-weight: 900;">Your Pre-Order is Available!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 15px;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding: 32px; text-align: center;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 20px;">Hi <strong>${userName}</strong>! 🌟 Great news — your pre-ordered item is now available!</p>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: left; display: flex; gap: 16px; align-items: center;">
            <img src="${productImage}" alt="${productName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 10px; border: 2px solid #e9ecef;" />
            <div>
              <div style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">${productName}</div>
              <div style="font-size: 18px; font-weight: 800; color: #fc1268;">₱${productPrice.toLocaleString()}</div>
            </div>
          </div>
          <div style="background: linear-gradient(135deg, #fdf2f8, #f5f3ff); border: 2px solid #fc1268; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 14px; color: #be185d; font-weight: 600;">✅ You can now add this item to your cart and complete your purchase!</p>
          </div>
          <a href="${SITE_URL}/my-preorders" style="display: inline-block; background: linear-gradient(135deg, #fc1268, #9c27b0); color: white; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 16px; font-weight: 700; margin-bottom: 16px;">
            🛍️ View My Pre-Orders
          </a>
          <p style="color: #9ca3af; font-size: 13px; margin: 0;">Go to My Pre-Orders tab to add the item to your cart.</p>
        </div>
        <div style="background: #f8f9fa; padding: 16px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise</p>
        </div>
      </div>
    `;

    await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: `🎉 Your pre-order "${productName}" is now available! | DKMerch`,
      html,
    });
  },
});