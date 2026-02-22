// convex/riders.ts
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
    });

    return { success: true, id };
  },
});

export const approveRider = mutation({
  args: {
    id: v.id("riderApplications"),
  },
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
        success: false,
        riderExists: true,
        message: "⏳ Your rider application is still pending admin approval. Please wait.",
      };
    }
    if (status === "rejected") {
      return {
        success: false,
        riderExists: true,
        message: "❌ Your rider application was not approved. Please contact support.",
      };
    }
    if (status === "suspended") {
      return {
        success: false,
        riderExists: true,
        message: "🚫 Your rider account has been suspended. Please contact admin.",
      };
    }

    if (rider.password && rider.password !== password) {
      return {
        success: false,
        riderExists: true,
        message: "Incorrect password. Please try again.",
      };
    }

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
    };
  },
});