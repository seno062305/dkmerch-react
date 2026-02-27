// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    role: v.string(),
    status: v.optional(v.string()),
    suspendReason: v.optional(v.string()),
    registeredAt: v.optional(v.string()),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  registrationAttempts: defineTable({
    fingerprint: v.string(),
    attemptedAt: v.number(),
    email: v.string(),
  }).index("by_fingerprint", ["fingerprint"]),

  reviews: defineTable({
    productId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
    rating: v.number(),
    review: v.string(),
    createdAt: v.string(),
  })
    .index("by_product", ["productId"])
    .index("by_product_user", ["productId", "userEmail"]),

  products: defineTable({
    name: v.string(),
    price: v.number(),
    stock: v.number(),
    image: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    releaseDate: v.optional(v.string()),
    releaseTime: v.optional(v.string()),
    kpopGroup: v.optional(v.string()),
    originalPrice: v.optional(v.number()),
    isSale: v.optional(v.boolean()),
    isPreOrder: v.optional(v.boolean()),
  }),

  cart: defineTable({
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
    qty: v.number(),
    finalPrice: v.optional(v.number()),
    promoCode: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    promoDiscount: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  wishlist: defineTable({
    userId: v.string(),
    productId: v.string(),
    name: v.string(),
    price: v.number(),
    image: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_product", ["userId", "productId"]),

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
        isPreOrder: v.optional(v.boolean()),
        releaseDate: v.optional(v.union(v.string(), v.null())),
      })
    ),
    total: v.number(),
    subtotal: v.optional(v.number()),
    shippingFee: v.optional(v.number()),
    promoCode:       v.optional(v.string()),
    promoName:       v.optional(v.string()),
    discountAmount:  v.optional(v.number()),
    discountPercent: v.optional(v.number()),
    finalTotal:      v.optional(v.number()),
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
    cancelReason: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
    paymentLinkUrl: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    confirmedAt: v.optional(v.string()),
    shippedAt: v.optional(v.string()),
    outForDeliveryAt: v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelledAt: v.optional(v.string()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_email", ["email"]),

  promos: defineTable({
    code: v.string(),
    name: v.string(),
    discount: v.number(),
    maxDiscount: v.number(),
    type: v.string(),
    minOrder: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    usedCount: v.number(),
    startDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

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
    // ✅ Device session tracking — for multi-device login detection
    activeSessionId: v.optional(v.string()),  // random UUID set on each login
    activeDeviceAt:  v.optional(v.number()),  // Date.now() of last login
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

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

  preOrderRequests: defineTable({
    userId: v.string(),
    productId: v.string(),
    userEmail: v.string(),
    userName: v.string(),
    productName: v.string(),
    productImage: v.string(),
    productPrice: v.number(),
    releaseDate: v.string(),
    releaseTime: v.string(),
    releaseTimestampMs: v.number(),
    isAvailable: v.boolean(),
    addedToCart: v.boolean(),
    notifiedAt: v.union(v.string(), v.null()),
    preOrderedAt: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_user_product", ["userId", "productId"])
    .index("by_product", ["productId"]),

  // ✅ Real-time rider GPS locations
  riderLocations: defineTable({
    orderId: v.string(),
    riderEmail: v.string(),
    riderName: v.string(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    heading: v.optional(v.number()),
    speed: v.optional(v.number()),
    isTracking: v.boolean(),
    updatedAt: v.number(),
    // ✅ NEW: which sessionId last updated this location (for device switch detection)
    sessionId: v.optional(v.string()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_riderEmail", ["riderEmail"]),
});