import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

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

export const getMyThread = query({
  args: { customerEmail: v.string() },
  handler: async ({ db }, { customerEmail }) => {
    const email = normalizeEmail(customerEmail);
    if (!email) return null;
    return await findThreadByEmail(db, email);
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
      updatedAt: now,
    });
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
      updatedAt: now,
    });
    return { success: true };
  },
});

export const listThreadsForAdmin = query({
  args: {},
  handler: async ({ db }) => {
    const threads = await db.query("supportThreads").collect();
    threads.sort((a: any, b: any) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
    return threads;
  },
});

export const getAdminUnreadCount = query({
  args: {},
  handler: async ({ db }) => {
    const threads = await db.query("supportThreads").collect();
    return threads.reduce((sum: number, t: any) => sum + (t.unreadByAdmin || 0), 0);
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
    await db.patch(threadId, { unreadByAdmin: 0, updatedAt: Date.now() });
    return { success: true };
  },
});

export const markThreadReadByCustomer = mutation({
  args: { customerEmail: v.string() },
  handler: async ({ db }, { customerEmail }) => {
    const email = normalizeEmail(customerEmail);
    const thread = await findThreadByEmail(db, email);
    if (!thread) return { success: false };
    await db.patch(thread._id, { unreadByCustomer: 0, updatedAt: Date.now() });
    return { success: true };
  },
});
