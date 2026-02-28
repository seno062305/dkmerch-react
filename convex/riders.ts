// convex/riders.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const genSessionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;

// ── Generate DKMerch Rider ID: DKR-YYYY-XXXX ──
const generateDkRiderId = (sequence: number): string => {
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(4, '0');
  return `DKR-${year}-${seq}`;
};

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
    riderPhoto: v.optional(v.union(v.string(), v.null())),
    validId1: v.optional(v.union(v.string(), v.null())),
    validId2: v.optional(v.union(v.string(), v.null())),
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", args.email))
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
      riderPhoto: args.riderPhoto,
      validId1: args.validId1,
      validId2: args.validId2,
    });
    return { success: true, id };
  },
});

export const approveRider = mutation({
  args: { id: v.id("riderApplications") },
  handler: async ({ db }, { id }) => {
    // Count all approved riders to generate next sequence number
    const allRiders = await db.query("riderApplications").collect();
    const approvedCount = allRiders.filter(r => r.dkRiderId).length;
    const nextSeq = approvedCount + 1;
    const dkRiderId = generateDkRiderId(nextSeq);

    await db.patch(id, {
      status: "approved",
      dkRiderId,
      dkRiderIdGeneratedAt: new Date().toISOString(),
    });
    return { success: true, dkRiderId };
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

    const newSessionId = genSessionId();
    await db.patch(rider._id, {
      activeSessionId: newSessionId,
      activeDeviceAt: Date.now(),
      kickedAt: undefined,
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
        dkRiderId: rider.dkRiderId,
      },
      sessionId: newSessionId,
    };
  },
});

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
      kickedAt: rider.kickedAt ?? null,
    };
  },
});

export const setRiderKickedAt = mutation({
  args: { email: v.string(), kickedAt: v.number() },
  handler: async ({ db }, { email, kickedAt }) => {
    const rider = await db
      .query("riderApplications")
      .withIndex("by_email", q => q.eq("email", email))
      .first();
    if (!rider) return { success: false };
    await db.patch(rider._id, { kickedAt });
    return { success: true };
  },
});

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