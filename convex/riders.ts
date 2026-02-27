// convex/riders.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const genSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

export const getAllRiders = query(async ({ db }) => {
  return await db.query("riderApplications").collect();
});

export const getRiderByEmail = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    return await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
  },
});

export const getRidersByStatus = query({
  args: { status: v.string() },
  handler: async ({ db }, { status }) => {
    return await db
      .query("riderApplications")
      .withIndex("by_status", q => q.eq("status", status))
      .collect();
  },
});

export const createRiderApplication = mutation({
  args: {
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", args.email)) // ✅ fixed: was bare `email`
      .first();
    if (existing) {
      return { success: false, message: "This email is already registered as a rider applicant." };
    }
    const id = await db.insert("riderApplications", {
      fullName: args.fullName,
      email: args.email,
      phone: args.phone,
      vehicleType: args.vehicleType,
      status: "pending",
      appliedAt: new Date().toISOString(),
      address: args.address,
      plateNumber: args.plateNumber,
      licenseNumber: args.licenseNumber,
      password: args.password,
    });
    return { success: true, id };
  },
});

export const approveRider = mutation({
  args: { id: v.id("riderApplications") },
  handler: async ({ db }, { id }) => {
    await db.patch(id, { status: "approved" });
    return { success: true };
  },
});

export const updateRiderStatus = mutation({
  args: { id: v.id("riderApplications"), status: v.string() },
  handler: async ({ db }, { id, status }) => {
    await db.patch(id, { status });
    return { success: true };
  },
});

export const updateRider = mutation({
  args: {
    id: v.id("riderApplications"),
    fullName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.string()),
    vehicleType: v.optional(v.string()),
  },
  handler: async ({ db }, { id, ...updates }) => {
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, val]) => val !== undefined)
    );
    await db.patch(id, filtered);
    return { success: true };
  },
});

export const deleteRider = mutation({
  args: { id: v.id("riderApplications") },
  handler: async ({ db }, { id }) => {
    await db.delete(id);
    return { success: true };
  },
});

// ✅ loginRider generates + saves sessionId directly in Convex
// Returns sessionId to client — client stores in sessionStorage only (not localStorage)
export const loginRider = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async ({ db }, { email, password }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!rider) {
      return { success: false, riderExists: false, message: "No rider account found." };
    }

    const status = rider.status?.toLowerCase();

    if (status === "pending") {
      return {
        success: false, riderExists: true,
        message: "⏳ Your rider application is still pending admin approval. Please wait.",
      };
    }
    if (status === "rejected") {
      return {
        success: false, riderExists: true,
        message: "❌ Your rider application was not approved. Please contact support.",
      };
    }
    if (status === "suspended") {
      return {
        success: false, riderExists: true,
        message: "🚫 Your rider account has been suspended. Please contact admin.",
      };
    }
    if (rider.password && rider.password !== password) {
      return {
        success: false, riderExists: true,
        message: "Incorrect password. Please try again.",
      };
    }

    // ✅ Generate and persist sessionId in Convex — source of truth
    const newSessionId = genSessionId();
    await db.patch(rider._id, {
      activeSessionId: newSessionId,
      activeDeviceAt: Date.now(),
    });

    return {
      success: true,
      riderExists: true,
      rider: {
        _id: rider._id,
        name: rider.fullName,
        email: rider.email,
        role: "rider",
        status: rider.status,
      },
      sessionId: newSessionId, // ✅ client stores in sessionStorage only
    };
  },
});

// ─────────────────────────────────────────────────────
// ✅ SESSION CHECK — Convex live query
// Fires automatically whenever activeSessionId changes in DB
// Old device detects mismatch within milliseconds (no polling needed)
// ─────────────────────────────────────────────────────
export const checkRiderSession = query({
  args: {
    email: v.string(),
    sessionId: v.string(),
  },
  handler: async ({ db }, { email, sessionId }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();

    if (!rider) return { valid: false, reason: "rider_not_found" };
    if (!rider.activeSessionId) return { valid: true };

    const isValid = rider.activeSessionId === sessionId;
    return {
      valid: isValid,
      reason: isValid ? "ok" : "new_device_logged_in",
      activeDeviceAt: rider.activeDeviceAt,
    };
  },
});

// ─────────────────────────────────────────────────────
// ✅ GPS TRACKING
// ─────────────────────────────────────────────────────
export const updateRiderLocation = mutation({
  args: {
    orderId: v.string(),
    riderEmail: v.string(),
    riderName: v.string(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    heading: v.optional(v.number()),
    speed: v.optional(v.number()),
    isTracking: v.boolean(),
    sessionId: v.optional(v.string()),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();

    if (existing) {
      await db.patch(existing._id, {
        lat: args.lat,
        lng: args.lng,
        accuracy: args.accuracy,
        heading: args.heading,
        speed: args.speed,
        isTracking: args.isTracking,
        updatedAt: Date.now(),
        sessionId: args.sessionId,
      });
    } else {
      await db.insert("riderLocations", {
        orderId: args.orderId,
        riderEmail: args.riderEmail,
        riderName: args.riderName,
        lat: args.lat,
        lng: args.lng,
        accuracy: args.accuracy,
        heading: args.heading,
        speed: args.speed,
        isTracking: args.isTracking,
        updatedAt: Date.now(),
        sessionId: args.sessionId,
      });
    }

    return { success: true };
  },
});

export const getRiderLocation = query({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    return await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();
  },
});

export const stopRiderTracking = mutation({
  args: { orderId: v.string() },
  handler: async ({ db }, { orderId }) => {
    const existing = await db
      .query("riderLocations")
      .withIndex("by_orderId", q => q.eq("orderId", orderId))
      .first();

    if (existing) {
      await db.patch(existing._id, {
        isTracking: false,
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});