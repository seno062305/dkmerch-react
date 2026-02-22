// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ── USERS ──────────────────────────────────────
  users: defineTable({
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.string(),
    status: v.optional(v.string()),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  // ── PRODUCTS ────────────────────────────────────
  products: defineTable({
    name: v.string(),
    price: v.number(),
    stock: v.number(),
    image: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
    isPreOrder: v.optional(v.boolean()),
  }),

  // ── CART ────────────────────────────────────────
  cart: defineTable({
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
    qty: v.number(),
  }).index("by_user", ["userId"]),

  // ── WISHLIST ─────────────────────────────────────
  wishlist: defineTable({
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_product", ["userId", "productId"]),

  // ── ORDERS ───────────────────────────────────────
  orders: defineTable({
    orderId: v.string(),
    email: v.string(),
    customerName: v.optional(v.string()),
    phone: v.optional(v.string()),
    items: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        price: v.number(),
        image: v.string(),
        quantity: v.number(),
      })
    ),
    total: v.number(),
    subtotal: v.optional(v.number()),
    shippingFee: v.optional(v.number()),
    status: v.string(),
    orderStatus: v.optional(v.string()),
    shippingAddress: v.optional(v.string()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    riderId: v.optional(v.string()),
    riderInfo: v.optional(v.any()),
    deliveryOtp: v.optional(v.string()),
    deliveryOtpVerified: v.optional(v.boolean()),
    deliveryProofPhoto: v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    // PayMongo payment fields
    paymentStatus: v.optional(v.string()),   // pending | paid | failed
    paymentLinkId: v.optional(v.string()),   // PayMongo link ID
    paymentLinkUrl: v.optional(v.string()),  // URL to redirect user
    paidAt: v.optional(v.string()),          // ISO timestamp when paid
  })
    .index("by_orderId", ["orderId"])
    .index("by_email", ["email"]),

  // ── PROMOS ───────────────────────────────────────
  promos: defineTable({
    code: v.string(),
    discount: v.number(),
    type: v.string(),
    minOrder: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    usedCount: v.number(),
    expiryDate: v.optional(v.string()),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  // ── RIDER APPLICATIONS ───────────────────────────
  riderApplications: defineTable({
    fullName: v.string(),
    email: v.string(),
    phone: v.string(),
    vehicleType: v.optional(v.string()),
    status: v.string(),
    appliedAt: v.string(),
    address: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    password: v.optional(v.string()),
    name: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // ── PICKUP REQUESTS ──────────────────────────────
  pickupRequests: defineTable({
    orderId: v.string(),
    riderId: v.string(),
    riderName: v.string(),
    riderEmail: v.string(),
    riderPhone: v.optional(v.string()),
    riderVehicle: v.optional(v.string()),
    riderPlate: v.optional(v.string()),
    customerName: v.optional(v.string()),
    total: v.optional(v.number()),
    requestedAt: v.string(),
    status: v.string(),
    approvedAt: v.optional(v.string()),
    rejectedAt: v.optional(v.string()),
  }).index("by_rider", ["riderId"]),
});