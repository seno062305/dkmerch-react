/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activityLogs from "../activityLogs.js";
import type * as adminCleanup from "../adminCleanup.js";
import type * as appUpdates from "../appUpdates.js";
import type * as backup from "../backup.js";
import type * as cart from "../cart.js";
import type * as catalogOptions from "../catalogOptions.js";
import type * as crons from "../crons.js";
import type * as deliveryChat from "../deliveryChat.js";
import type * as failoverApply from "../failoverApply.js";
import type * as failoverSync from "../failoverSync.js";
import type * as firebaseSync from "../firebaseSync.js";
import type * as init from "../init.js";
import type * as lib_orderSeq from "../lib/orderSeq.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as pickupRequests from "../pickupRequests.js";
import type * as preOrderRequests from "../preOrderRequests.js";
import type * as productStats from "../productStats.js";
import type * as products from "../products.js";
import type * as promos from "../promos.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as quickSignIn from "../quickSignIn.js";
import type * as reviews from "../reviews.js";
import type * as rewards from "../rewards.js";
import type * as riderNotifications from "../riderNotifications.js";
import type * as riders from "../riders.js";
import type * as sendEmail from "../sendEmail.js";
import type * as settings from "../settings.js";
import type * as supportChat from "../supportChat.js";
import type * as users from "../users.js";
import type * as webPush from "../webPush.js";
import type * as wishlist from "../wishlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityLogs: typeof activityLogs;
  adminCleanup: typeof adminCleanup;
  appUpdates: typeof appUpdates;
  backup: typeof backup;
  cart: typeof cart;
  catalogOptions: typeof catalogOptions;
  crons: typeof crons;
  deliveryChat: typeof deliveryChat;
  failoverApply: typeof failoverApply;
  failoverSync: typeof failoverSync;
  firebaseSync: typeof firebaseSync;
  init: typeof init;
  "lib/orderSeq": typeof lib_orderSeq;
  orders: typeof orders;
  payments: typeof payments;
  pickupRequests: typeof pickupRequests;
  preOrderRequests: typeof preOrderRequests;
  productStats: typeof productStats;
  products: typeof products;
  promos: typeof promos;
  pushSubscriptions: typeof pushSubscriptions;
  quickSignIn: typeof quickSignIn;
  reviews: typeof reviews;
  rewards: typeof rewards;
  riderNotifications: typeof riderNotifications;
  riders: typeof riders;
  sendEmail: typeof sendEmail;
  settings: typeof settings;
  supportChat: typeof supportChat;
  users: typeof users;
  webPush: typeof webPush;
  wishlist: typeof wishlist;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
