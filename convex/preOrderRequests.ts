// convex/preOrderRequests.ts
import {
  query,
  mutation,
  internalMutation,
  internalAction,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const SITE_URL = process.env.SITE_URL || "https://dkmerchwebsite.vercel.app";

// ── Helper: convert relative image path to absolute URL ──
function resolveImageUrl(image: string): string {
  if (!image) return "";
  if (image.startsWith("http://") || image.startsWith("https://")) return image;
  // e.g. "/images/blackpink.jpg" → "https://dkmerchwebsite.vercel.app/images/blackpink.jpg"
  return `${SITE_URL}${image.startsWith("/") ? "" : "/"}${image}`;
}

// ── Helper: validate email format ──
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  // Basic email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

// ── Helper: delay in ms (for rate limiting) ──
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── INTERNAL QUERY: All pending pre-orders (for cron) ──
export const getAllPendingPreOrders = internalQuery({
  args: {},
  handler: async ({ db }) => {
    return await db
      .query("preOrderRequests")
      .filter((q) => q.eq(q.field("isAvailable"), false))
      .collect();
  },
});

// ── GET: All pre-order requests ng isang user ──
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

    return withProducts.sort((a, b) => {
      if (a.isAvailable && !b.isAvailable) return -1;
      if (!a.isAvailable && b.isAvailable) return 1;
      return new Date(b.preOrderedAt).getTime() - new Date(a.preOrderedAt).getTime();
    });
  },
});

// ── GET: Check kung may available na pre-order si user (for badge) ──
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

// ── GET: Check kung naka-pre-order na ng user yung product ──
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
    if (releaseTime) return all.some((r) => r.releaseTime === releaseTime);
    return all.length > 0;
  },
});

// ── MUTATION: Mag pre-order ng product (customer) ──
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

    if (!product) return { success: false, message: "Product not found." };

    const rd = product.releaseDate || "";
    const rt = (product as any).releaseTime || "00:00";

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

    let releaseTimestampMs = 0;
    if (rd && rt) {
      releaseTimestampMs = new Date(`${rd}T${rt}:00+08:00`).getTime();
    }

    if (!rd || !rt || releaseTimestampMs === 0) {
      return { success: false, message: "Product has no valid release schedule." };
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

// ── MUTATION: Mark as addedToCart ──
export const markPreOrderAddedToCart = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, { addedToCart: true });
    return { success: true };
  },
});

// ── MUTATION: Remove/Cancel pre-order ──
export const removePreOrder = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.delete(requestId);
    return { success: true };
  },
});

export const cancelPreOrder = mutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.delete(requestId);
    return { success: true };
  },
});

// ── INTERNAL MUTATION: Mark as available + set notifiedAt ──
export const markPreOrderAvailable = internalMutation({
  args: { requestId: v.id("preOrderRequests") },
  handler: async ({ db }, { requestId }) => {
    await db.patch(requestId, {
      isAvailable: true,
      notifiedAt: new Date().toISOString(),
    });
  },
});

// ── INTERNAL ACTION: Cron — i-check at i-release kung due na ──
export const checkAndReleasePreOrders = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();

    const pendingRequests: any[] = await ctx.runQuery(
      internal.preOrderRequests.getAllPendingPreOrders,
      {}
    );

    for (const req of pendingRequests) {
      if (!req.releaseDate || !req.releaseTime) continue;

      let releaseMs: number;
      if (req.releaseTimestampMs && req.releaseTimestampMs > 0) {
        releaseMs = req.releaseTimestampMs;
      } else {
        releaseMs = new Date(`${req.releaseDate}T${req.releaseTime}:00+08:00`).getTime();
      }

      if (!releaseMs || isNaN(releaseMs)) continue;

      if (nowMs >= releaseMs) {
        await ctx.runMutation(internal.preOrderRequests.markPreOrderAvailable, {
          requestId: req._id,
        });

        // ✅ Only send if valid email
        if (isValidEmail(req.userEmail)) {
          await ctx.runAction(internal.preOrderRequests.sendPreOrderAvailableEmail, {
            to: req.userEmail,
            userName: req.userName,
            productName: req.productName,
            productImage: req.productImage,
            productPrice: req.productPrice,
            requestId: req._id,
          });

          // ✅ Rate limit: wait 600ms between sends (max ~1.5 req/sec, under the 2/sec limit)
          await delay(600);
        }
      }
    }
  },
});

// ── INTERNAL ACTION: Email — item available na ──
export const sendPreOrderAvailableEmail = internalAction({
  args: {
    to: v.string(),
    userName: v.string(),
    productName: v.string(),
    productImage: v.string(),
    productPrice: v.number(),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, { to, userName, productName, productImage, productPrice }) => {
    const preOrderLink = `${SITE_URL}/my-preorders?tab=available`;
    const absoluteImage = resolveImageUrl(productImage);

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.12);">
        <div style="background: linear-gradient(135deg, #fc1268, #9c27b0); padding: 36px 32px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
          <h1 style="color: white; margin: 0 0 8px; font-size: 26px; font-weight: 900;">Your Pre-Order is Available!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 15px;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding: 32px; text-align: center;">
          <p style="color: #374151; font-size: 16px; margin: 0 0 24px; text-align: left;">
            Hi <strong>${userName}</strong>! 🌟 Great news — your pre-ordered item is now available!
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
            <tr>
              <td width="100" style="padding: 16px; vertical-align: middle;">
                <img src="${absoluteImage}" alt="${productName}" width="80" height="80"
                  style="display: block; border-radius: 10px; border: 2px solid #e9ecef; width: 80px; height: 80px;" />
              </td>
              <td style="padding: 16px; vertical-align: middle; text-align: left;">
                <div style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px;">${productName}</div>
                <div style="font-size: 20px; font-weight: 800; color: #fc1268;">&#8369;${productPrice.toLocaleString()}</div>
              </td>
            </tr>
          </table>
          <div style="background: linear-gradient(135deg, #fdf2f8, #f5f3ff); border: 2px solid #fc1268; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 14px; color: #be185d; font-weight: 600;">
              ✅ You can now add this item to your cart and complete your purchase!
            </p>
          </div>
          <a href="${preOrderLink}" style="display: inline-block; background: linear-gradient(135deg, #fc1268, #9c27b0); color: white; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 16px; font-weight: 700; margin-bottom: 16px;">
            🛍️ View My Pre-Orders
          </a>
          <p style="color: #9ca3af; font-size: 13px; margin: 8px 0 0;">Go to My Pre-Orders tab to add the item to your cart.</p>
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

// ══════════════════════════════════════════════════════════════════
// ── PUBLIC ACTION: Admin nag-add ng bagong pre-order product →
//    mag-email sa LAHAT ng registered users (with rate limiting)
// ══════════════════════════════════════════════════════════════════
export const announceNewPreOrderToAllUsers = action({
  args: {
    productName: v.string(),
    productImage: v.string(),
    productPrice: v.number(),
    releaseDate: v.string(),
    releaseTime: v.string(),
  },
  handler: async (ctx, { productName, productImage, productPrice, releaseDate, releaseTime }) => {
    const absoluteImage = resolveImageUrl(productImage);

    // ── Format release date for display (PHT) ──
    const releaseDateFormatted = new Date(`${releaseDate}T${releaseTime}:00+08:00`)
      .toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

    // ── Get all users from DB ──
    const users: any[] = await ctx.runQuery(internal.preOrderRequests.getAllUsers, {});

    // ── Filter to valid emails only ──
    const validUsers = users.filter((u) => isValidEmail(u.email));

    console.log(`[announceNewPreOrder] Total users: ${users.length}, Valid emails: ${validUsers.length}`);

    const preOrderPageLink = `${SITE_URL}/pre-order`;
    const imageUrl = absoluteImage;
    let successCount = 0;
    let failCount = 0;

    for (const user of validUsers) {
      const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.12);">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6, #9c27b0); padding: 36px 32px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">⏰</div>
            <h1 style="color: white; margin: 0 0 8px; font-size: 26px; font-weight: 900;">New Pre-Order Available!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 15px;">DKMerch K-Pop Paradise</p>
          </div>

          <!-- Body -->
          <div style="padding: 32px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
              Hi <strong>${user.name || "DKMerch Fan"}</strong>! 🌟 A new item is now open for pre-order!
            </p>

            <!-- Product Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 12px; margin-bottom: 24px; overflow: hidden;">
              <tr>
                <td width="100" style="padding: 16px; vertical-align: middle;">
                  <img src="${imageUrl}" alt="${productName}" width="80" height="80"
                    style="display: block; border-radius: 10px; border: 2px solid #e9ecef; width: 80px; height: 80px;" />
                </td>
                <td style="padding: 16px; vertical-align: middle; text-align: left;">
                  <div style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px;">${productName}</div>
                  <div style="font-size: 20px; font-weight: 800; color: #fc1268;">&#8369;${productPrice.toLocaleString()}</div>
                </td>
              </tr>
            </table>

            <!-- Release Date Notice -->
            <div style="background: linear-gradient(135deg, #eff6ff, #f5f3ff); border: 2px solid #3b82f6; border-radius: 12px; padding: 16px; margin-bottom: 24px; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 13px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">🗓 Release Date</p>
              <p style="margin: 0; font-size: 18px; font-weight: 800; color: #1e40af;">${releaseDateFormatted}</p>
              <p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">You'll be notified again once it's available to add to cart!</p>
            </div>

            <!-- CTA -->
            <div style="text-align: center;">
              <a href="${preOrderPageLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #9c27b0); color: white; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 16px; font-weight: 700;">
                🛒 Pre-Order Now
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #f8f9fa; padding: 16px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise</p>
          </div>
        </div>
      `;

      try {
        await ctx.runAction(internal.sendEmail.sendEmail, {
          to: user.email.trim(),
          subject: `⏰ New Pre-Order: "${productName}" | DKMerch`,
          html,
        });
        successCount++;
      } catch (err) {
        console.error(`[announceNewPreOrder] Failed to send to ${user.email}:`, err);
        failCount++;
      }

      // ✅ Rate limit: 600ms delay between each email (stays under Resend's 2 req/sec)
      await delay(600);
    }

    console.log(`[announceNewPreOrder] Done. Sent: ${successCount}, Failed: ${failCount}`);
    return { success: true, sent: successCount, failed: failCount };
  },
});

// ── INTERNAL QUERY: Get all users (for announcement emails) ──
export const getAllUsers = internalQuery({
  args: {},
  handler: async ({ db }) => {
    return await db.query("users").collect();
  },
});