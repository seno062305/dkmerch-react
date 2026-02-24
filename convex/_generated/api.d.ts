/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cart from "../cart.js";
import type * as crons from "../crons.js";
import type * as init from "../init.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as pickupRequests from "../pickupRequests.js";
import type * as preOrderRequests from "../preOrderRequests.js";
import type * as products from "../products.js";
import type * as promos from "../promos.js";
import type * as riders from "../riders.js";
import type * as sendEmail from "../sendEmail.js";
import type * as users from "../users.js";
import type * as wishlist from "../wishlist.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cart: typeof cart;
  crons: typeof crons;
  init: typeof init;
  orders: typeof orders;
  payments: typeof payments;
  pickupRequests: typeof pickupRequests;
  preOrderRequests: typeof preOrderRequests;
  products: typeof products;
  promos: typeof promos;
  riders: typeof riders;
  sendEmail: typeof sendEmail;
  users: typeof users;
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
