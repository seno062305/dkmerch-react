import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

function peso(n: number) {
  return `₱${Number(n || 0).toLocaleString("en-PH")}`;
}

function shortOrderId(orderId: string) {
  return String(orderId || "").slice(-8).toUpperCase();
}

/** Build order-details chat body (mirrors admin Order Summary). */
function buildOrderConfirmedChatMessage(order: any, opts: { isLbc: boolean }) {
  const shortId = shortOrderId(order.orderId);
  const name = String(order.customerName || "Customer").trim() || "Customer";
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = items.reduce(
    (sum: number, item: any) =>
      sum + Number(item.price || 0) * Number(item.quantity || item.qty || 1),
    0,
  );
  const shipping = Number(order.shippingFee ?? 0);
  const total = Number(order.finalTotal ?? order.total ?? subtotal + shipping);
  const payment =
    String(order.paymentMethod || "").trim() || "GCash / Maya";
  const dateSrc = order.paidAt || order.confirmedAt || order.createdAt;
  const dateLabel = dateSrc
    ? new Date(dateSrc).toLocaleString("en-PH", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  const itemLines = items.length
    ? items
        .map((item: any) => {
          const qty = Number(item.quantity || item.qty || 1);
          const price = Number(item.price || 0);
          return `• ${item.name || "Item"} — ${peso(price)} × ${qty}`;
        })
        .join("\n")
    : "• (no items listed)";

  const address = String(order.shippingAddress || "N/A").trim() || "N/A";
  const intro = opts.isLbc
    ? "Your LBC order has been confirmed by DKMerch. Here's your order summary:"
    : "Your order has been confirmed by DKMerch. Here's your order summary:";
  const shippingLine = opts.isLbc
    ? (shipping > 0
      ? `Shipping: ${peso(shipping)} · LBC`
      : "Shipping: LBC — arrange with admin")
    : (shipping > 0 ? `Shipping: ${peso(shipping)}` : "Shipping: FREE");
  const closing = opts.isLbc
    ? "We'll ship via LBC Express. Reply here if you have questions!"
    : "A rider will claim your order next. Reply here if you have questions!";

  return [
    `Hi ${name}!`,
    ``,
    intro,
    ``,
    `📦 Order #${shortId}`,
    `📅 Date: ${dateLabel}`,
    `💳 Payment: ${payment} · Paid`,
    ``,
    `🛍️ Items (${items.length}):`,
    itemLines,
    ``,
    `Subtotal: ${peso(subtotal)}`,
    shippingLine,
    `Total: ${peso(total)}`,
    ``,
    `📍 Delivery Address:`,
    address,
    ``,
    closing,
  ].join("\n");
}

async function findThreadByEmail(db: any, email: string) {
  return await db
    .query("supportThreads")
    .withIndex("by_customerEmail", (q: any) => q.eq("customerEmail", email))
    .first();
}

export const generateChatUploadUrl = mutation({
  args: {},
  handler: async ({ storage }) => {
    return await storage.generateUploadUrl();
  },
});

export const getChatImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async ({ storage }, { storageId }) => {
    return await storage.getUrl(storageId);
  },
});

/** Customer: get or create their support thread */
export const getOrCreateMyThread = mutation({
  args: {
    customerEmail: v.string(),
    customerName: v.string(),
    customerUserId: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const email = normalizeEmail(args.customerEmail);
    if (!email) throw new Error("Email is required");
    const existing = await findThreadByEmail(db, email);
    if (existing) {
      await db.patch(existing._id, {
        customerName: args.customerName || existing.customerName,
        customerUserId: args.customerUserId || existing.customerUserId,
        status: "open",
        archivedAt: 0,
        updatedAt: Date.now(),
      });
      return { threadId: existing._id };
    }
    const now = Date.now();
    const threadId = await db.insert("supportThreads", {
      customerEmail: email,
      customerName: args.customerName || "Customer",
      customerUserId: args.customerUserId,
      lastMessageAt: now,
      lastMessagePreview: "",
      unreadByAdmin: 0,
      unreadByCustomer: 0,
      status: "open",
      updatedAt: now,
      createdAt: now,
    });
    return { threadId };
  },
});

const ONLINE_WINDOW_MS = 60_000;

async function getPresenceOnlineAt(db: any, key: string) {
  const row = await db
    .query("supportPresence")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  return row?.onlineAt || 0;
}

async function getAdminPresenceOnlineAt(db: any) {
  return getPresenceOnlineAt(db, "admin");
}

async function upsertPresence(db: any, key: string, now: number) {
  const existing = await db
    .query("supportPresence")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .first();
  if (existing) {
    await db.patch(existing._id, { onlineAt: now });
  } else {
    await db.insert("supportPresence", { key, onlineAt: now });
  }
}

function customerPresenceKey(email: string) {
  return `customer:${normalizeEmail(email)}`;
}

export const getMyThread = query({
  args: { customerEmail: v.string() },
  handler: async ({ db }, { customerEmail }) => {
    const email = normalizeEmail(customerEmail);
    if (!email) return null;
    const thread = await findThreadByEmail(db, email);
    if (!thread) return null;
    const globalAdminOnlineAt = await getAdminPresenceOnlineAt(db);
    const adminOnlineAt = Math.max(thread.adminOnlineAt || 0, globalAdminOnlineAt || 0);
    return { ...thread, adminOnlineAt };
  },
});

/** Customer header can poll this even before a thread exists. */
export const getAdminOnline = query({
  args: {},
  handler: async ({ db }) => {
    const onlineAt = await getAdminPresenceOnlineAt(db);
    return { onlineAt, isOnline: onlineAt > 0 && Date.now() - onlineAt < ONLINE_WINDOW_MS };
  },
});

export const listMessages = query({
  args: { threadId: v.id("supportThreads") },
  handler: async ({ db, storage }, { threadId }) => {
    const rows = await db
      .query("supportMessages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
    rows.sort((a: any, b: any) => a.createdAt - b.createdAt);
    const withUrls = [];
    for (const msg of rows) {
      let imageUrl: string | null = null;
      if (msg.imageStorageId) {
        imageUrl = await storage.getUrl(msg.imageStorageId);
      }
      withUrls.push({ ...msg, imageUrl });
    }
    return withUrls;
  },
});

export const sendCustomerMessage = mutation({
  args: {
    customerEmail: v.string(),
    customerName: v.string(),
    customerUserId: v.optional(v.string()),
    body: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async ({ db }, args) => {
    const email = normalizeEmail(args.customerEmail);
    const body = String(args.body || "").trim();
    if (!email) throw new Error("Email is required");
    if (!body && !args.imageStorageId) throw new Error("Message or image is required");

    let thread = await findThreadByEmail(db, email);
    const now = Date.now();
    if (!thread) {
      const threadId = await db.insert("supportThreads", {
        customerEmail: email,
        customerName: args.customerName || "Customer",
        customerUserId: args.customerUserId,
        lastMessageAt: now,
        lastMessagePreview: body || "📷 Image",
        unreadByAdmin: 1,
        unreadByCustomer: 0,
        status: "open",
        customerOnlineAt: now,
        updatedAt: now,
        createdAt: now,
      });
      await db.insert("supportMessages", {
        threadId,
        senderRole: "customer",
        senderName: args.customerName || "Customer",
        senderEmail: email,
        body: body || undefined,
        imageStorageId: args.imageStorageId,
        createdAt: now,
      });
      await upsertPresence(db, customerPresenceKey(email), now);
      return { success: true, threadId };
    }

    await db.insert("supportMessages", {
      threadId: thread._id,
      senderRole: "customer",
      senderName: args.customerName || thread.customerName || "Customer",
      senderEmail: email,
      body: body || undefined,
      imageStorageId: args.imageStorageId,
      createdAt: now,
    });
    await db.patch(thread._id, {
      customerName: args.customerName || thread.customerName,
      lastMessageAt: now,
      lastMessagePreview: body || "📷 Image",
      unreadByAdmin: (thread.unreadByAdmin || 0) + 1,
      status: "open",
      archivedAt: 0, // new customer message restores from archive
      customerOnlineAt: now,
      updatedAt: now,
    });
    await upsertPresence(db, customerPresenceKey(email), now);
    return { success: true, threadId: thread._id };
  },
});

export const sendAdminMessage = mutation({
  args: {
    threadId: v.id("supportThreads"),
    adminName: v.string(),
    adminEmail: v.optional(v.string()),
    body: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async ({ db }, args) => {
    const body = String(args.body || "").trim();
    if (!body && !args.imageStorageId) throw new Error("Message or image is required");
    const thread = await db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    const now = Date.now();
    await db.insert("supportMessages", {
      threadId: args.threadId,
      senderRole: "admin",
      senderName: args.adminName || "Admin",
      senderEmail: args.adminEmail,
      body: body || undefined,
      imageStorageId: args.imageStorageId,
      createdAt: now,
    });
    await db.patch(args.threadId, {
      lastMessageAt: now,
      lastMessagePreview: body || "📷 Image",
      unreadByCustomer: (thread.unreadByCustomer || 0) + 1,
      status: "open",
      adminOnlineAt: now,
      updatedAt: now,
    });
    await upsertPresence(db, "admin", now);
    return { success: true };
  },
});

/**
 * After admin confirms any paid order: auto-open/create support chat
 * and send the order-details summary to the customer (LBC + rider).
 */
export const sendOrderConfirmedChat = internalMutation({
  args: {
    orderId: v.string(),
    isLbc: v.optional(v.boolean()),
  },
  handler: async ({ db }, { orderId, isLbc }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
      .first();
    if (!order?.email) return { success: false, reason: "no_email" };

    const email = normalizeEmail(order.email);
    if (!email) return { success: false, reason: "no_email" };

    const lbc = !!isLbc || String(order.deliveryMethod || "").toLowerCase() === "lbc";
    const body = buildOrderConfirmedChatMessage(order, { isLbc: lbc });
    const preview = `Order #${shortOrderId(orderId)} confirmed`;
    const now = Date.now();
    let thread = await findThreadByEmail(db, email);

    if (!thread) {
      const threadId = await db.insert("supportThreads", {
        customerEmail: email,
        customerName: order.customerName || "Customer",
        customerUserId: order.userId ? String(order.userId) : undefined,
        lastMessageAt: now,
        lastMessagePreview: preview,
        unreadByAdmin: 0,
        unreadByCustomer: 1,
        status: "open",
        updatedAt: now,
        createdAt: now,
      });
      await db.insert("supportMessages", {
        threadId,
        senderRole: "admin",
        senderName: "DKMerch Admin",
        body,
        createdAt: now,
      });
      await upsertPresence(db, "admin", now);
      return { success: true, threadId };
    }

    await db.insert("supportMessages", {
      threadId: thread._id,
      senderRole: "admin",
      senderName: "DKMerch Admin",
      body,
      createdAt: now,
    });
    await db.patch(thread._id, {
      customerName: order.customerName || thread.customerName,
      lastMessageAt: now,
      lastMessagePreview: preview,
      unreadByCustomer: (thread.unreadByCustomer || 0) + 1,
      status: "open",
      archivedAt: 0,
      adminOnlineAt: now,
      updatedAt: now,
    });
    await upsertPresence(db, "admin", now);
    return { success: true, threadId: thread._id };
  },
});

/**
 * After admin marks LBC (or other) order as shipped: send chat + optional photo.
 */
export const sendOrderShippedChat = internalMutation({
  args: {
    orderId: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    isLbc: v.optional(v.boolean()),
  },
  handler: async ({ db }, { orderId, imageStorageId, isLbc }) => {
    const order = await db
      .query("orders")
      .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
      .first();
    if (!order?.email) return { success: false, reason: "no_email" };

    const email = normalizeEmail(order.email);
    if (!email) return { success: false, reason: "no_email" };

    const lbc = !!isLbc || String(order.deliveryMethod || "").toLowerCase() === "lbc";
    const shortId = shortOrderId(orderId);
    const name = String(order.customerName || "Customer").trim() || "Customer";
    const body = [
      `Hi ${name}!`,
      ``,
      lbc
        ? `Your order #${shortId} has been shipped via LBC Express.`
        : `Your order #${shortId} has been marked as shipped.`,
      imageStorageId
        ? `Here's the shipping proof photo:`
        : `We'll update you again when it's out for delivery / delivered.`,
      ``,
      `Track your order anytime in the app.`,
    ].join("\n");
    const preview = imageStorageId
      ? `Shipped · #${shortId} 📷`
      : `Order #${shortId} shipped`;
    const now = Date.now();
    let thread = await findThreadByEmail(db, email);

    if (!thread) {
      const threadId = await db.insert("supportThreads", {
        customerEmail: email,
        customerName: order.customerName || "Customer",
        customerUserId: order.userId ? String(order.userId) : undefined,
        lastMessageAt: now,
        lastMessagePreview: preview,
        unreadByAdmin: 0,
        unreadByCustomer: 1,
        status: "open",
        updatedAt: now,
        createdAt: now,
      });
      await db.insert("supportMessages", {
        threadId,
        senderRole: "admin",
        senderName: "DKMerch Admin",
        body,
        imageStorageId: imageStorageId || undefined,
        createdAt: now,
      });
      await upsertPresence(db, "admin", now);
      return { success: true, threadId };
    }

    await db.insert("supportMessages", {
      threadId: thread._id,
      senderRole: "admin",
      senderName: "DKMerch Admin",
      body,
      imageStorageId: imageStorageId || undefined,
      createdAt: now,
    });
    await db.patch(thread._id, {
      customerName: order.customerName || thread.customerName,
      lastMessageAt: now,
      lastMessagePreview: preview,
      unreadByCustomer: (thread.unreadByCustomer || 0) + 1,
      status: "open",
      archivedAt: 0,
      adminOnlineAt: now,
      updatedAt: now,
    });
    await upsertPresence(db, "admin", now);
    return { success: true, threadId: thread._id };
  },
});

export const listThreadsForAdmin = query({
  args: {},
  handler: async ({ db }) => {
    const threads = await db.query("supportThreads").collect();
    const active = threads.filter((t: any) => !(t.archivedAt > 0));
    active.sort((a: any, b: any) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    const enriched = [];
    for (const t of active) {
      const email = normalizeEmail(t.customerEmail || "");
      const globalCustomerOnlineAt = email
        ? await getPresenceOnlineAt(db, customerPresenceKey(email))
        : 0;
      const customerOnlineAt = Math.max(t.customerOnlineAt || 0, globalCustomerOnlineAt || 0);
      enriched.push({ ...t, customerOnlineAt });
    }
    return enriched;
  },
});

export const listArchivedThreadsForAdmin = query({
  args: {},
  handler: async ({ db }) => {
    const threads = await db.query("supportThreads").collect();
    const archived = threads.filter((t: any) => t.archivedAt > 0);
    archived.sort((a: any, b: any) => (b.archivedAt || 0) - (a.archivedAt || 0));
    return archived;
  },
});

export const archiveThread = mutation({
  args: { threadId: v.id("supportThreads") },
  handler: async ({ db }, { threadId }) => {
    const thread = await db.get(threadId);
    if (!thread) throw new Error("Thread not found");
    await db.patch(threadId, {
      archivedAt: Date.now(),
      status: "closed",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const unarchiveThread = mutation({
  args: { threadId: v.id("supportThreads") },
  handler: async ({ db }, { threadId }) => {
    const thread = await db.get(threadId);
    if (!thread) throw new Error("Thread not found");
    await db.patch(threadId, {
      archivedAt: 0,
      status: "open",
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const getAdminUnreadCount = query({
  args: {},
  handler: async ({ db }) => {
    const threads = await db.query("supportThreads").collect();
    return threads
      .filter((t: any) => !(t.archivedAt > 0))
      .reduce((sum: number, t: any) => sum + (t.unreadByAdmin || 0), 0);
  },
});

export const getCustomerUnreadCount = query({
  args: { customerEmail: v.string() },
  handler: async ({ db }, { customerEmail }) => {
    const email = normalizeEmail(customerEmail);
    if (!email) return 0;
    const thread = await findThreadByEmail(db, email);
    return thread?.unreadByCustomer || 0;
  },
});

export const markThreadReadByAdmin = mutation({
  args: { threadId: v.id("supportThreads") },
  handler: async ({ db }, { threadId }) => {
    const thread = await db.get(threadId);
    if (!thread) return { success: false };
    const now = Date.now();
    await db.patch(threadId, {
      unreadByAdmin: 0,
      adminLastReadAt: now,
      adminOnlineAt: now,
      updatedAt: now,
    });
    return { success: true };
  },
});

export const markThreadReadByCustomer = mutation({
  args: { customerEmail: v.string() },
  handler: async ({ db }, { customerEmail }) => {
    const email = normalizeEmail(customerEmail);
    const thread = await findThreadByEmail(db, email);
    if (!thread) return { success: false };
    const now = Date.now();
    await db.patch(thread._id, {
      unreadByCustomer: 0,
      customerLastReadAt: now,
      customerOnlineAt: now,
      updatedAt: now,
    });
    return { success: true };
  },
});

/** Keep presence fresh while the account is open (call every ~15s). */
export const heartbeatPresence = mutation({
  args: {
    role: v.union(v.literal("customer"), v.literal("admin")),
    customerEmail: v.optional(v.string()),
    threadId: v.optional(v.id("supportThreads")),
  },
  handler: async ({ db }, args) => {
    const now = Date.now();
    if (args.role === "customer") {
      const email = normalizeEmail(args.customerEmail || "");
      if (!email) return { success: false };
      // Global customer presence — admin chat shows Online while account is open
      await upsertPresence(db, customerPresenceKey(email), now);
      const thread = await findThreadByEmail(db, email);
      if (thread) {
        await db.patch(thread._id, { customerOnlineAt: now, updatedAt: now });
      }
      return { success: true };
    }

    // Global admin presence — customers see Online while admin account is open
    await upsertPresence(db, "admin", now);

    if (args.threadId) {
      const thread = await db.get(args.threadId);
      if (thread) {
        await db.patch(args.threadId, { adminOnlineAt: now, updatedAt: now });
      }
    }
    return { success: true };
  },
});
