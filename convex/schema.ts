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
    suspendReason:  v.optional(v.string()),
    suspendNote:    v.optional(v.string()),
    suspendedAt:    v.optional(v.number()),
    suspendedUntil: v.optional(v.number()),
    registeredAt: v.optional(v.string()),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    barangay: v.optional(v.string()),
    city: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    addressLat: v.optional(v.number()),
    addressLng: v.optional(v.number()),
    // ── Login PIN (set after OTP; used instead of OTP on later logins) ──
    pin:                      v.optional(v.string()),
    /** Digit count of the PIN the customer set (4–6) — for unlock pad dots */
    pinLength:                v.optional(v.number()),
    loginOtp:                 v.optional(v.string()),
    loginOtpExpiresAt:        v.optional(v.number()),
    // ── Self-reactivation OTP ─────────────────
    reactivationOtp:          v.optional(v.string()),
    reactivationOtpExpiresAt: v.optional(v.number()),
    // ── Soft delete ────────────────────────────
    deletedAt:                v.optional(v.number()),
    // ── Active session(s). Yes on new-device login adds a session; does not kick the old one.
    activeSessionId:          v.optional(v.string()),
    activeSessionIds:         v.optional(v.array(v.string())),
    activeDeviceAt:           v.optional(v.number()),
    activeDeviceName:         v.optional(v.string()),
    activeDeviceLocation:     v.optional(v.string()),
    activeDevicePlatform:     v.optional(v.string()),
    /**
     * Pending new-device login (FB-style).
     * New device is NOT active until status becomes "approved".
     */
    loginAlert: v.optional(v.object({
      sessionId: v.string(),
      previousSessionId: v.optional(v.string()),
      deviceName: v.string(),
      location: v.string(),
      platform: v.optional(v.string()),
      at: v.number(),
      /** Auto-deny if still pending after this time. */
      expiresAt: v.optional(v.number()),
      status: v.optional(v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("denied"),
      )),
      resolved: v.optional(v.boolean()),
    })),
    /** Last time the customer changed username (7-day cooldown). */
    usernameChangedAt:        v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_username", ["username"]),

  pendingUsers: defineTable({
    name: v.string(),
    username: v.string(),
    email: v.string(),
    password: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    otp: v.optional(v.string()),
    otpExpiresAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"]),

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
    saleStartDate: v.optional(v.string()),
    saleStartTime: v.optional(v.string()),
    saleEndDate: v.optional(v.string()),
    saleEndTime: v.optional(v.string()),
    isPreOrder: v.optional(v.boolean()),
    /** Set when cron flips a pre-order into the regular catalog */
    releasedAt: v.optional(v.number()),
    /** Prevents re-blasting “new item released” emails on every cron tick */
    releaseAnnouncedAt: v.optional(v.number()),
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
    riderLinkSessions:   v.optional(v.any()),
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
    addressLat: v.optional(v.number()),
    addressLng: v.optional(v.number()),
    /** 'rider' = NCR motorcycle delivery; 'lbc' = outside NCR via LBC Express */
    deliveryMethod: v.optional(v.string()),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
    riderId: v.optional(v.string()),
    riderInfo: v.optional(v.any()),
    riderGpsLink: v.optional(v.string()),
    riderLinkSessionId:  v.optional(v.string()),
    riderLinkSessionAt:  v.optional(v.number()),
    riderLinkDeviceInfo: v.optional(v.string()),
    deliveryOtp: v.optional(v.string()),
    deliveryOtpVerified: v.optional(v.boolean()),
    deliveryProofPhoto: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    cancelRequestStatus: v.optional(v.string()),
    cancelRequestReason: v.optional(v.string()),
    cancelRequestMethod: v.optional(v.string()),
    cancelRequestPhone: v.optional(v.string()),
    cancelRequestedAt: v.optional(v.string()),
    cancelRequestNote: v.optional(v.string()),
    cancelResolvedAt: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    paymentLinkId: v.optional(v.string()),
    paymentLinkUrl: v.optional(v.string()),
    paymongoRefundId: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    confirmedAt: v.optional(v.string()),
    shippedAt: v.optional(v.string()),
    outForDeliveryAt: v.optional(v.string()),
    deliveryConfirmedAt: v.optional(v.string()),
    cancelledAt: v.optional(v.string()),
    /** 'customer' | 'admin' */
    cancelledBy: v.optional(v.string()),
    /** Admin screenshot proof that refund money was sent (GCash/Maya/PayMongo) */
    cancelRefundProofId: v.optional(v.string()),
    refundStatus:          v.optional(v.string()),
    refundReason:          v.optional(v.string()),
    refundComment:         v.optional(v.string()),
    refundPhotoId:         v.optional(v.string()),
    refundMethod:          v.optional(v.string()),
    refundAccountName:     v.optional(v.string()),
    refundAccountNumber:   v.optional(v.string()),
    refundAmount:          v.optional(v.number()),
    refundRequestedAt:     v.optional(v.string()),
    refundResolvedAt:      v.optional(v.string()),
    refundPaidAt:          v.optional(v.string()),
    refundAdminNote:       v.optional(v.string()),
    refundHistory:         v.optional(v.any()),
    pointsAwarded:         v.optional(v.boolean()),
    isRewardOrder:         v.optional(v.boolean()),
    rewardTicketCode:      v.optional(v.string()),
    /** Monotonic store-wide order number (1, 2, 3…) — allocated under a Convex lock */
    orderSeq:              v.optional(v.number()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_email", ["email"])
    .index("by_orderSeq", ["orderSeq"]),

  /** Single-row lock/counter for sequential order numbers */
  orderCounters: defineTable({
    name: v.string(), // "orders"
    nextSeq: v.number(),
  }).index("by_name", ["name"]),

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
    activeSessionId: v.optional(v.string()),
    activeSessionIds: v.optional(v.array(v.string())),
    activeDeviceAt:  v.optional(v.number()),
    activeDeviceName: v.optional(v.string()),
    activeDeviceLocation: v.optional(v.string()),
    activeDevicePlatform: v.optional(v.string()),
    kickedAt: v.optional(v.number()),
    loginAlert: v.optional(v.object({
      sessionId: v.string(),
      previousSessionId: v.optional(v.string()),
      deviceName: v.string(),
      location: v.string(),
      platform: v.optional(v.string()),
      at: v.number(),
      expiresAt: v.optional(v.number()),
      status: v.optional(v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("denied"),
      )),
      resolved: v.optional(v.boolean()),
    })),
    riderPhoto: v.optional(v.union(v.string(), v.null())),
    validId1: v.optional(v.union(v.string(), v.null())),
    validId2: v.optional(v.union(v.string(), v.null())),
    dkRiderId: v.optional(v.string()),
    dkRiderIdGeneratedAt: v.optional(v.string()),
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
    fromScan: v.optional(v.boolean()),
    scannedAt: v.optional(v.string()),
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
    sessionId: v.optional(v.string()),
    lastKnownLat:     v.optional(v.number()),
    lastKnownLng:     v.optional(v.number()),
    lastKnownAt:      v.optional(v.number()),
    lastKnownAddress: v.optional(v.union(v.string(), v.null())),
  })
    .index("by_orderId", ["orderId"])
    .index("by_riderEmail", ["riderEmail"]),

  riderNotifications: defineTable({
    type: v.string(),
    orderId: v.string(),
    customerName: v.string(),
    total: v.number(),
    message: v.optional(v.string()),
    createdAt: v.string(),
    read: v.boolean(),
  }).index("by_read", ["read"]),

  /** In-app notification center for customers (bell next to profile). */
  customerNotifications: defineTable({
    email: v.string(),
    type: v.string(), // order_confirmed | order_update | order_deleted | promo | out_for_delivery | cancel_rejected | cancel_approved | …
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    orderId: v.optional(v.string()),
    createdAt: v.number(),
    read: v.boolean(),
  })
    .index("by_email", ["email"])
    .index("by_email_read", ["email", "read"])
    .index("by_email_created", ["email", "createdAt"]),

  settings: defineTable({
    storeName:    v.optional(v.string()),
    storeAddress: v.optional(v.string()),
    storeLat:     v.optional(v.number()),
    storeLng:     v.optional(v.number()),
    autoBackupSchedule: v.optional(v.string()), // "daily" | "weekly" | "off"
    lastAutoBackupAt:   v.optional(v.number()),
    lastRestoreAt:      v.optional(v.number()),
    // Convex → Firebase mirror status
    lastFirebaseSyncAt:      v.optional(v.number()),
    lastFirebaseSyncCount:   v.optional(v.number()),
    lastFirebaseSyncFailed:  v.optional(v.number()),
    lastFirebaseSyncMessage: v.optional(v.string()),
    lastFirebaseSyncOk:      v.optional(v.boolean()),
  }),

  activityLogs: defineTable({
    action: v.string(),
    actorEmail: v.optional(v.string()),
    actorName: v.optional(v.string()),
    actorRole: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  systemBackups: defineTable({
    name: v.string(),
    schedule: v.optional(v.string()),
    createdAt: v.number(),
    recordCount: v.number(),
    sizeBytes: v.number(),
    tables: v.array(v.string()),
    storageId: v.optional(v.id("_storage")),
    createdBy: v.optional(v.string()),
    kind: v.optional(v.string()), // backup | restore | archive
  }).index("by_createdAt", ["createdAt"]),

  /** Soft-deleted live table snapshots (archive packages). Permanent delete removes these. */
  systemArchives: defineTable({
    name: v.string(),
    tableName: v.string(),
    createdAt: v.number(),
    createdBy: v.optional(v.string()),
    recordCount: v.number(),
    sizeBytes: v.number(),
    storageId: v.optional(v.id("_storage")),
  }).index("by_createdAt", ["createdAt"]),

  /** Customer accounts removed from live users (unregister) — kept for audit until permanent wipe. */
  userArchives: defineTable({
    originalUserId: v.optional(v.string()),
    name: v.string(),
    username: v.string(),
    email: v.string(),
    role: v.string(),
    status: v.optional(v.string()),
    phone: v.optional(v.string()),
    registeredAt: v.optional(v.string()),
    snapshot: v.any(),
    archivedAt: v.number(),
    archivedBy: v.optional(v.string()),
    reason: v.optional(v.string()),
  })
    .index("by_archivedAt", ["archivedAt"])
    .index("by_email", ["email"]),

  // ── Rewards System ────────────────────────────────────────────────────────
  userPoints: defineTable({
    email: v.string(),
    userName: v.string(),
    totalPoints: v.number(),
    history: v.array(v.object({
      orderId:     v.string(),
      points:      v.number(),
      orderTotal:  v.number(),
      earnedAt:    v.string(),
    })),
  }).index("by_email", ["email"]),

  rewardRedemptions: defineTable({
    email:        v.string(),
    userName:     v.string(),
    rewardType:   v.string(),
    pointsSpent:  v.number(),
    status:       v.string(),
    requestedAt:  v.string(),
    resolvedAt:   v.optional(v.string()),
    adminNote:    v.optional(v.string()),
    ticketCode:   v.string(),
    selectedProductId:    v.optional(v.string()),
    selectedProductName:  v.optional(v.string()),
    selectedProductImage: v.optional(v.string()),
    selectedProductGroup: v.optional(v.string()),
    productSelectedAt:    v.optional(v.string()),
    checkedOutOrderId:    v.optional(v.string()),
    checkedOutAt:         v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // Customer ↔ Admin support chat
  supportThreads: defineTable({
    customerEmail: v.string(),
    customerName: v.string(),
    customerUserId: v.optional(v.string()),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    unreadByAdmin: v.number(),
    unreadByCustomer: v.number(),
    status: v.string(), // open | closed
    archivedAt: v.optional(v.number()),
    updatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_customerEmail", ["customerEmail"])
    .index("by_lastMessageAt", ["lastMessageAt"])
    .index("by_archivedAt", ["archivedAt"]),

  supportMessages: defineTable({
    threadId: v.id("supportThreads"),
    senderRole: v.string(), // customer | admin
    senderName: v.string(),
    senderEmail: v.optional(v.string()),
    body: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  }).index("by_threadId", ["threadId"]),

  // Customer ↔ Rider delivery chat (per order)
  deliveryThreads: defineTable({
    orderId: v.string(),
    customerEmail: v.string(),
    customerName: v.string(),
    riderEmail: v.optional(v.string()),
    riderName: v.optional(v.string()),
    lastMessageAt: v.number(),
    lastMessagePreview: v.optional(v.string()),
    unreadByCustomer: v.number(),
    unreadByRider: v.number(),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_customerEmail", ["customerEmail"])
    .index("by_riderEmail", ["riderEmail"]),

  deliveryMessages: defineTable({
    threadId: v.id("deliveryThreads"),
    orderId: v.string(),
    senderRole: v.string(), // customer | rider
    senderName: v.string(),
    senderEmail: v.optional(v.string()),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_orderId", ["orderId"]),

  // Customer app update announcements (Maintenance → Update system)
  appUpdates: defineTable({
    version: v.string(),
    title: v.string(),
    message: v.string(),
    publishedAt: v.number(),
    isActive: v.boolean(),
  }).index("by_publishedAt", ["publishedAt"]),

  // Web Push subscriptions (installed PWA / browser)
  pushSubscriptions: defineTable({
    email: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_endpoint", ["endpoint"]),


  // Admin-managed product categories & K-Pop groups (plus defaults in code)
  catalogOptions: defineTable({
    type: v.union(v.literal("category"), v.literal("kpopGroup")),
    value: v.string(),
    label: v.string(),
    createdAt: v.number(),
    isRemoved: v.optional(v.boolean()),
    /** Marquee / group logo path (e.g. /images/foo.png) or resolved URL */
    image: v.optional(v.string()),
    /** Convex file storage for uploaded group logos */
    imageStorageId: v.optional(v.id("_storage")),
  })
    .index("by_type", ["type"])
    .index("by_type_value", ["type", "value"]),

  // Desktop login QR — approved by scanning on a logged-in mobile app
  quickSignInSessions: defineTable({
    token: v.string(),
    status: v.string(), // pending | approved | consumed | expired
    createdAt: v.number(),
    expiresAt: v.number(),
    approvedAt: v.optional(v.number()),
    userId: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    userName: v.optional(v.string()),
    username: v.optional(v.string()),
    phone: v.optional(v.string()),
    role: v.optional(v.string()),
  }).index("by_token", ["token"]),

  /** Shared OTP / verification-email cooldown (reset PIN, forgot pass, register, reactivate, etc.) */
  emailOtpCooldowns: defineTable({
    email: v.string(),
    sendCount: v.number(),
    lastSentAt: v.number(),
    nextAllowedAt: v.number(),
  }).index("by_email", ["email"]),

});
