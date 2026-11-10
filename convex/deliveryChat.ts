import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

export const getOrCreateThread = mutation({
  args: {
    orderId: v.string(),
    customerEmail: v.string(),
    customerName: v.string(),
    riderEmail: v.optional(v.string()),
    riderName: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const orderId = String(args.orderId || "").trim();
    if (!orderId) throw new Error("Order ID required");
    const existing = await db
      .query("deliveryThreads")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    const now = Date.now();
    if (existing) {
      await db.patch(existing._id, {
        customerEmail: normalizeEmail(args.customerEmail) || existing.customerEmail,
        customerName: args.customerName || existing.customerName,
        riderEmail: args.riderEmail ? normalizeEmail(args.riderEmail) : existing.riderEmail,
        riderName: args.riderName || existing.riderName,
        updatedAt: now,
      });
      return { threadId: existing._id };
    }
    const threadId = await db.insert("deliveryThreads", {
      orderId,
      customerEmail: normalizeEmail(args.customerEmail),
      customerName: args.customerName || "Customer",
      riderEmail: args.riderEmail ? normalizeEmail(args.riderEmail) : "",
      riderName: args.riderName || "",
      lastMessageAt: now,
      lastMessagePreview: "",
      unreadByCustomer: 0,
      unreadByRider: 0,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return { threadId };
  },
});

export const getThreadByOrder = query({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    return await db
      .query("deliveryThreads")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
  },
});

export const listMessages = query({
  args: { threadId: v.id("deliveryThreads") },
  handler: async ({ db }, { threadId }) => {
    const rows = await db
      .query("deliveryMessages")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .collect();
    return rows.sort((a: any, b: any) => a.createdAt - b.createdAt);
  },
});

export const sendMessage = mutation({
  args: {
    orderId: v.string(),
    senderRole: v.string(), // customer | rider
    senderName: v.string(),
    senderEmail: v.string(),
    body: v.string(),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    riderName: v.optional(v.string()),
    riderEmail: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const body = String(args.body || "").trim();
    if (!body) throw new Error("Message is empty");
    const orderId = String(args.orderId || "").trim();
    let thread = await db
      .query("deliveryThreads")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    const now = Date.now();
    if (!thread) {
      const threadId = await db.insert("deliveryThreads", {
        orderId,
        customerEmail: normalizeEmail(
          args.senderRole === "customer"
            ? args.senderEmail
            : (args.customerEmail || "")
        ),
        customerName: args.customerName || (args.senderRole === "customer" ? args.senderName : "Customer"),
        riderEmail: normalizeEmail(args.riderEmail || (args.senderRole === "rider" ? args.senderEmail : "")),
        riderName: args.riderName || (args.senderRole === "rider" ? args.senderName : ""),
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 120),
        unreadByCustomer: args.senderRole === "rider" ? 1 : 0,
        unreadByRider: args.senderRole === "customer" ? 1 : 0,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      thread = await db.get(threadId);
    }
    if (!thread) throw new Error("Could not open chat");

    await db.insert("deliveryMessages", {
      threadId: thread._id,
      orderId,
      senderRole: args.senderRole,
      senderName: args.senderName,
      senderEmail: normalizeEmail(args.senderEmail),
      body,
      createdAt: now,
    });

    await db.patch(thread._id, {
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 120),
      unreadByCustomer:
        args.senderRole === "rider"
          ? (thread.unreadByCustomer || 0) + 1
          : thread.unreadByCustomer || 0,
      unreadByRider:
        args.senderRole === "customer"
          ? (thread.unreadByRider || 0) + 1
          : thread.unreadByRider || 0,
      riderEmail: args.riderEmail
        ? normalizeEmail(args.riderEmail)
        : thread.riderEmail,
      riderName: args.riderName || thread.riderName,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const markRead = mutation({
  args: {
    orderId: v.string(),
    readerRole: v.string(), // customer | rider
  },
  handler: async ({ db }, { orderId, readerRole }) => {
    const thread = await db
      .query("deliveryThreads")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .first();
    if (!thread) return { success: true };
    if (readerRole === "customer") {
      await db.patch(thread._id, { unreadByCustomer: 0, updatedAt: Date.now() });
    } else if (readerRole === "rider") {
      await db.patch(thread._id, { unreadByRider: 0, updatedAt: Date.now() });
    }
    return { success: true };
  },
});
