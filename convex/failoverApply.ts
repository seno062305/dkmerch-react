/**
 * Apply Firebase failover_writes back into Convex (no "use node").
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { allocateOrderSeq, ensureOrderCounterSeeded } from "./lib/orderSeq";

function asNum(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

async function upsertOrder(ctx: any, order: any) {
  const orderId = String(order?.orderId || "").trim();
  if (!orderId) return { ok: false, reason: "missing_orderId" };
  const existing = await ctx.db
    .query("orders")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
    .first();
  if (existing) {
    // Patch payment/status fields if present
    const patch: Record<string, any> = {};
    for (const k of [
      "status", "orderStatus", "paymentStatus", "paymentLinkId", "paymentLinkUrl",
      "customerName", "phone", "shippingAddress", "notes", "riderId",
    ]) {
      if (order[k] !== undefined) patch[k] = order[k];
    }
    if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
    return { ok: true, reason: "updated", convexId: existing._id };
  }
  const items = Array.isArray(order.items)
    ? order.items.map((it: any) => ({
        id: String(it?.id || ""),
        name: String(it?.name || "Item"),
        price: asNum(it?.price),
        image: String(it?.image || ""),
        quantity: asNum(it?.quantity, 1),
        isPreOrder: !!it?.isPreOrder,
        releaseDate: it?.releaseDate ?? null,
      }))
    : [];
  // Allocate sequential number under the same counter lock used by orders.createOrder
  let orderSeq: number | undefined =
    order.orderSeq != null && asNum(order.orderSeq) <= 999_999
      ? asNum(order.orderSeq)
      : undefined;
  if (orderSeq == null) {
    await ensureOrderCounterSeeded(ctx.db);
    orderSeq = await allocateOrderSeq(ctx.db);
  }

  const convexId = await ctx.db.insert("orders", {
    orderId,
    orderSeq,
    email: String(order.email || ""),
    customerName: order.customerName ? String(order.customerName) : undefined,
    phone: order.phone ? String(order.phone) : undefined,
    items,
    total: asNum(order.total),
    subtotal: order.subtotal != null ? asNum(order.subtotal) : undefined,
    shippingFee: order.shippingFee != null ? asNum(order.shippingFee) : undefined,
    promoCode: order.promoCode ? String(order.promoCode) : undefined,
    discountAmount: order.discountAmount != null ? asNum(order.discountAmount) : undefined,
    discountPercent: order.discountPercent != null ? asNum(order.discountPercent) : undefined,
    finalTotal: order.finalTotal != null ? asNum(order.finalTotal) : undefined,
    status: String(order.status || "Pending Payment"),
    orderStatus: String(order.orderStatus || "pending"),
    shippingAddress: order.shippingAddress ? String(order.shippingAddress) : undefined,
    addressLat: order.addressLat != null ? asNum(order.addressLat) : undefined,
    addressLng: order.addressLng != null ? asNum(order.addressLng) : undefined,
    paymentMethod: String(order.paymentMethod || "paymongo"),
    notes: order.notes ? String(order.notes) : undefined,
    paymentStatus: String(order.paymentStatus || "pending"),
    isRewardOrder: order.isRewardOrder ? true : undefined,
    rewardTicketCode: order.rewardTicketCode ? String(order.rewardTicketCode) : undefined,
  } as any);
  return { ok: true, reason: "inserted", convexId, needsPayment: true, needsEmail: true, orderId };
}

export const applyFailoverWrite = internalMutation({
  args: { write: v.any() },
  handler: async (ctx, { write }) => {
    const mutation = String(write?.mutation || "");
    const table = String(write?.table || "");
    const args = write?.args || {};
    const payload = write?.payload || args;
    const key = mutation || table;

    // ── Orders ───────────────────────────────────────────
    if (key === "orders:createOrder" || (table === "orders" && !mutation.includes("update"))) {
      const r = await upsertOrder(ctx, payload);
      return { ...r, needsPayment: write?._needsPayment || r.needsPayment, needsEmail: write?._needsEmail || r.needsEmail };
    }
    if (key === "orders:updateOrderStatus") {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_orderId", (q: any) => q.eq("orderId", String(args.orderId || "")))
        .first();
      if (!order) return { ok: false, reason: "order_missing" };
      await ctx.db.patch(order._id, {
        ...(args.orderStatus != null && { orderStatus: args.orderStatus }),
        ...(args.status != null && { status: args.status }),
      });
      return { ok: true, reason: "patched", convexId: order._id };
    }
    if (key === "orders:updateOrderFields") {
      const order = await ctx.db
        .query("orders")
        .withIndex("by_orderId", (q: any) => q.eq("orderId", String(args.orderId || "")))
        .first();
      if (!order) return { ok: false, reason: "order_missing" };
      const { orderId, ...rest } = args;
      await ctx.db.patch(order._id, rest);
      return { ok: true, reason: "patched", convexId: order._id };
    }

    // ── Cart ─────────────────────────────────────────────
    if (key === "cart:addToCart") {
      const userId = String(args.userId || "");
      const productId = String(args.productId || "");
      if (!userId || !productId) return { ok: false, reason: "bad_cart_args" };
      const all = await ctx.db.query("cart").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
      const hasPromo = !!args.promoCode;
      const existing = all.find((item: any) => {
        if (item.productId !== productId) return false;
        if (hasPromo) return item.promoCode === args.promoCode;
        return !item.promoCode;
      });
      if (existing) {
        await ctx.db.patch(existing._id, { qty: (existing.qty || 1) + 1 });
        return { ok: true, reason: "patched", convexId: existing._id };
      }
      const convexId = await ctx.db.insert("cart", {
        userId,
        productId,
        name: String(args.name || ""),
        price: asNum(args.price),
        image: String(args.image || ""),
        qty: 1,
        ...(args.finalPrice !== undefined && { finalPrice: asNum(args.finalPrice) }),
        ...(args.promoCode !== undefined && { promoCode: String(args.promoCode) }),
        ...(args.discountAmount !== undefined && { discountAmount: asNum(args.discountAmount) }),
        ...(args.promoDiscount !== undefined && { promoDiscount: asNum(args.promoDiscount) }),
      });
      return { ok: true, reason: "inserted", convexId };
    }
    if (key === "cart:removeFromCart") {
      const userId = String(args.userId || "");
      const productId = String(args.productId || "");
      const all = await ctx.db.query("cart").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
      const item = all.find((i: any) => {
        if (i.productId !== productId) return false;
        if (args.promoCode) return i.promoCode === args.promoCode;
        return !i.promoCode;
      });
      if (item) await ctx.db.delete(item._id);
      return { ok: true, reason: item ? "deleted" : "noop" };
    }
    if (key === "cart:clearCart") {
      const userId = String(args.userId || "");
      const items = await ctx.db.query("cart").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
      for (const item of items) await ctx.db.delete(item._id);
      return { ok: true, reason: "cleared" };
    }
    if (key === "cart:updateQty") {
      const userId = String(args.userId || "");
      const productId = String(args.productId || "");
      const qty = asNum(args.qty, 1);
      const all = await ctx.db.query("cart").withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
      const item = all.find((i: any) => {
        if (i.productId !== productId) return false;
        if (args.promoCode) return i.promoCode === args.promoCode;
        return !i.promoCode;
      });
      if (!item) return { ok: false, reason: "cart_item_missing" };
      if (qty <= 0) await ctx.db.delete(item._id);
      else await ctx.db.patch(item._id, { qty });
      return { ok: true, reason: "patched", convexId: item._id };
    }
    // cartItemId-based ops need live Convex ids — skip if id invalid after outage
    if (key === "cart:removeFromCartById" || key === "cart:updateQtyById") {
      return { ok: false, reason: "requires_live_cart_id", deferred: true };
    }

    // ── Wishlist ─────────────────────────────────────────
    if (key === "wishlist:toggleWishlist") {
      const userId = String(args.userId || "");
      const productId = String(args.productId || "");
      const existing = await ctx.db
        .query("wishlist")
        .withIndex("by_user_product", (q: any) => q.eq("userId", userId).eq("productId", productId))
        .first();
      if (existing) {
        await ctx.db.delete(existing._id);
        return { ok: true, reason: "deleted", convexId: existing._id };
      }
      const convexId = await ctx.db.insert("wishlist", {
        userId,
        productId,
        name: String(args.name || ""),
        price: asNum(args.price),
        image: String(args.image || ""),
      });
      return { ok: true, reason: "inserted", convexId };
    }
    if (key === "wishlist:removeFromWishlist") {
      const userId = String(args.userId || "");
      const productId = String(args.productId || "");
      const existing = await ctx.db
        .query("wishlist")
        .withIndex("by_user_product", (q: any) => q.eq("userId", userId).eq("productId", productId))
        .first();
      if (existing) await ctx.db.delete(existing._id);
      return { ok: true, reason: existing ? "deleted" : "noop" };
    }

    // ── Products ─────────────────────────────────────────
    if (key === "products:addProduct") {
      const convexId = await ctx.db.insert("products", {
        name: String(payload.name || args.name || "Product"),
        price: asNum(payload.price ?? args.price),
        stock: asNum(payload.stock ?? args.stock, 0),
        image: String(payload.image ?? args.image ?? ""),
        category: payload.category ?? args.category,
        description: payload.description ?? args.description,
        status: payload.status ?? args.status,
        releaseDate: payload.releaseDate ?? args.releaseDate,
        releaseTime: payload.releaseTime ?? args.releaseTime,
        kpopGroup: payload.kpopGroup ?? args.kpopGroup,
        originalPrice: payload.originalPrice ?? args.originalPrice,
        isSale: payload.isSale ?? args.isSale,
        saleStartDate: payload.saleStartDate ?? args.saleStartDate,
        saleStartTime: payload.saleStartTime ?? args.saleStartTime,
        saleEndDate: payload.saleEndDate ?? args.saleEndDate,
        saleEndTime: payload.saleEndTime ?? args.saleEndTime,
        isPreOrder: payload.isPreOrder ?? args.isPreOrder,
      } as any);
      return { ok: true, reason: "inserted", convexId };
    }
    if (key === "products:updateProduct") {
      const id = args.id || args._id;
      if (!id) return { ok: false, reason: "missing_product_id" };
      try {
        const { id: _i, _id, ...rest } = args;
        await ctx.db.patch(id, rest);
        return { ok: true, reason: "patched", convexId: id };
      } catch {
        return { ok: false, reason: "product_patch_failed", deferred: true };
      }
    }
    if (key === "products:deleteProduct") {
      const id = args.id || args._id;
      if (!id) return { ok: false, reason: "missing_product_id" };
      try {
        await ctx.db.delete(id);
        return { ok: true, reason: "deleted", convexId: id };
      } catch {
        return { ok: false, reason: "product_delete_failed", deferred: true };
      }
    }

    // ── Promos ───────────────────────────────────────────
    if (key === "promos:createPromo") {
      const code = String(args.code || payload.code || "").toUpperCase().trim();
      if (!code) return { ok: false, reason: "missing_promo_code" };
      const existing = await ctx.db.query("promos").withIndex("by_code", (q: any) => q.eq("code", code)).first();
      if (existing) return { ok: true, reason: "duplicate", convexId: existing._id };
      const convexId = await ctx.db.insert("promos", {
        code,
        name: String(args.name || payload.name || ""),
        discount: asNum(args.discount ?? payload.discount),
        maxDiscount: asNum(args.maxDiscount ?? payload.maxDiscount, 999999),
        type: String(args.type || payload.type || "percent"),
        minOrder: args.minOrder ?? payload.minOrder,
        maxUses: args.maxUses ?? payload.maxUses,
        usedCount: asNum(args.usedCount ?? payload.usedCount, 0),
        startDate: args.startDate ?? payload.startDate,
        startTime: args.startTime ?? payload.startTime,
        endDate: args.endDate ?? payload.endDate,
        endTime: args.endTime ?? payload.endTime,
        isActive: args.isActive !== false,
      } as any);
      return { ok: true, reason: "inserted", convexId };
    }

    // ── Users (registration / profile) ───────────────────
    if (key === "users:registerPendingUser" || key === "users:createUser") {
      const email = String(args.email || payload.email || "").trim().toLowerCase();
      if (!email) return { ok: false, reason: "missing_email" };
      const existing = await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", email)).first();
      if (existing) return { ok: true, reason: "duplicate", convexId: existing._id };
      if (key === "users:registerPendingUser") {
        const convexId = await ctx.db.insert("pendingUsers", {
          name: String(args.name || ""),
          username: String(args.username || ""),
          email,
          password: String(args.password || ""),
          token: String(args.token || `failover-${Date.now()}`),
          expiresAt: asNum(args.expiresAt, Date.now() + 86400000),
          createdAt: asNum(args.createdAt, Date.now()),
          otp: args.otp,
          otpExpiresAt: args.otpExpiresAt,
        } as any);
        return { ok: true, reason: "inserted_pending", convexId, needsEmail: true };
      }
      const convexId = await ctx.db.insert("users", {
        name: String(args.name || payload.name || ""),
        username: String(args.username || payload.username || email.split("@")[0]),
        email,
        password: String(args.password || payload.password || ""),
        role: String(args.role || "user"),
        status: String(args.status || "active"),
        registeredAt: args.registeredAt || new Date().toISOString(),
      } as any);
      return { ok: true, reason: "inserted", convexId };
    }
    if (key === "users:saveProfile") {
      const userId = args.userId || args.id;
      if (!userId) return { ok: false, reason: "missing_user_id", deferred: true };
      try {
        const { userId: _u, id: _i, ...rest } = args;
        await ctx.db.patch(userId, rest);
        return { ok: true, reason: "patched", convexId: userId };
      } catch {
        return { ok: false, reason: "profile_patch_failed", deferred: true };
      }
    }

    // ── Riders ───────────────────────────────────────────
    if (key === "riders:createRiderApplication" || key === "riders:adminCreateRider") {
      const email = String(args.email || payload.email || "").trim().toLowerCase();
      if (!email) return { ok: false, reason: "missing_email" };
      const existing = await ctx.db.query("riderApplications").withIndex("by_email", (q: any) => q.eq("email", email)).first();
      if (existing) return { ok: true, reason: "duplicate", convexId: existing._id };
      const convexId = await ctx.db.insert("riderApplications", {
        fullName: String(args.fullName || args.name || ""),
        email,
        phone: String(args.phone || ""),
        vehicleType: args.vehicleType,
        status: String(args.status || "pending"),
        appliedAt: String(args.appliedAt || new Date().toISOString()),
        address: args.address,
        plateNumber: args.plateNumber,
        licenseNumber: args.licenseNumber,
        password: args.password,
        name: args.name,
        riderPhoto: args.riderPhoto,
        validId1: args.validId1,
        validId2: args.validId2,
      } as any);
      return { ok: true, reason: "inserted", convexId, needsEmail: true };
    }

    // ── Reviews ──────────────────────────────────────────
    if (key === "reviews:addReview" || key === "reviews:createReview") {
      const productId = String(args.productId || "");
      const userEmail = String(args.userEmail || "").toLowerCase();
      if (!productId || !userEmail) return { ok: false, reason: "bad_review_args" };
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_product_user", (q: any) => q.eq("productId", productId).eq("userEmail", userEmail))
        .first();
      if (existing) return { ok: true, reason: "duplicate", convexId: existing._id };
      const convexId = await ctx.db.insert("reviews", {
        productId,
        userEmail,
        userName: String(args.userName || "Customer"),
        rating: asNum(args.rating, 5),
        review: String(args.review || args.comment || ""),
        createdAt: String(args.createdAt || new Date().toISOString()),
      });
      return { ok: true, reason: "inserted", convexId };
    }

    // ── Settings ─────────────────────────────────────────
    if (key === "settings:updateSettings") {
      const existing = await ctx.db.query("settings").first();
      if (existing) {
        const { ...rest } = args;
        await ctx.db.patch(existing._id, rest);
        return { ok: true, reason: "patched", convexId: existing._id };
      }
      const convexId = await ctx.db.insert("settings", { storeName: "DKMerch Store", ...args } as any);
      return { ok: true, reason: "inserted", convexId };
    }

    // ── Pickup / preorder / generic insert by table ──────
    if (key === "pickupRequests:createPickupRequest" || table === "pickupRequests") {
      const convexId = await ctx.db.insert("pickupRequests", {
        orderId: String(args.orderId || payload.orderId || ""),
        riderId: String(args.riderId || payload.riderId || ""),
        riderName: String(args.riderName || payload.riderName || ""),
        riderEmail: String(args.riderEmail || payload.riderEmail || ""),
        riderPhone: args.riderPhone ?? payload.riderPhone,
        riderVehicle: args.riderVehicle ?? payload.riderVehicle,
        riderPlate: args.riderPlate ?? payload.riderPlate,
        customerName: args.customerName ?? payload.customerName,
        total: args.total != null ? asNum(args.total) : payload.total,
        requestedAt: String(args.requestedAt || payload.requestedAt || new Date().toISOString()),
        status: String(args.status || payload.status || "pending"),
        fromScan: args.fromScan ?? payload.fromScan,
        scannedAt: args.scannedAt ?? payload.scannedAt,
      } as any);
      return { ok: true, reason: "inserted", convexId };
    }

    if (key === "preOrderRequests:create" || table === "preOrderRequests") {
      const userId = String(args.userId || payload.userId || "");
      const productId = String(args.productId || payload.productId || "");
      if (userId && productId) {
        const existing = await ctx.db
          .query("preOrderRequests")
          .withIndex("by_user_product", (q: any) => q.eq("userId", userId).eq("productId", productId))
          .first();
        if (existing) return { ok: true, reason: "duplicate", convexId: existing._id };
      }
      const convexId = await ctx.db.insert("preOrderRequests", {
        userId,
        productId,
        userEmail: String(args.userEmail || payload.userEmail || ""),
        userName: String(args.userName || payload.userName || ""),
        productName: String(args.productName || payload.productName || ""),
        productImage: String(args.productImage || payload.productImage || ""),
        productPrice: asNum(args.productPrice ?? payload.productPrice),
        releaseDate: String(args.releaseDate || payload.releaseDate || ""),
        releaseTime: String(args.releaseTime || payload.releaseTime || ""),
        releaseTimestampMs: asNum(args.releaseTimestampMs ?? payload.releaseTimestampMs, Date.now()),
        isAvailable: !!(args.isAvailable ?? payload.isAvailable),
        addedToCart: !!(args.addedToCart ?? payload.addedToCart),
        notifiedAt: args.notifiedAt ?? payload.notifiedAt ?? null,
        preOrderedAt: String(args.preOrderedAt || payload.preOrderedAt || new Date().toISOString()),
      } as any);
      return { ok: true, reason: "inserted", convexId };
    }

    // Unknown — keep pending for later expansion
    await ctx.db.insert("activityLogs", {
      action: "failover_unhandled",
      actorRole: "system",
      details: `Unhandled failover mutation: ${key}`.slice(0, 500),
      createdAt: Date.now(),
    });
    return { ok: false, reason: "unhandled", deferred: true, mutation: key };
  },
});
