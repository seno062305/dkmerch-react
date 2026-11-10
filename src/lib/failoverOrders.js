/**
 * Orders helper — thin wrapper over generic failover writes.
 * Still mirrors into legacy failover_orders for older sync-back docs.
 */
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import {
  FAILOVER_ORDERS_LEGACY,
  runWithFailover,
  saveFailoverWrite,
  withTimeout,
  isConvexDownError,
} from "./failoverWrite";

export { withTimeout, isConvexDownError };

export async function saveFailoverOrder(orderPayload) {
  const orderId = String(orderPayload?.orderId || "").trim();
  if (!orderId) throw new Error("orderId is required for failover save");

  // Generic queue
  const generic = await saveFailoverWrite({
    table: "orders",
    mutation: "orders:createOrder",
    args: orderPayload,
    docKey: orderId,
    payload: orderPayload,
    needsEmail: true,
    needsPayment: true,
  });

  // Legacy collection (compat)
  try {
    await setDoc(
      doc(db, FAILOVER_ORDERS_LEGACY, orderId),
      {
        ...orderPayload,
        orderId,
        _failover: true,
        _failoverAt: Date.now(),
        _syncStatus: "pending",
        _syncedAt: null,
        _convexId: null,
        _needsEmail: true,
        _needsPayment: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[failover] legacy failover_orders write failed:", e);
  }

  return { ...generic, orderId, success: true };
}

export async function createOrderWithFailover(mutateFn, args) {
  try {
    return await runWithFailover(mutateFn, args, {
      table: "orders",
      mutation: "orders:createOrder",
      docKey: args?.orderId,
      payload: args,
      needsEmail: true,
      needsPayment: true,
    });
  } catch (err) {
    // runWithFailover rethrows non-outage errors; outage returns save result
    throw err;
  }
}

// Prefer dual-write via saveFailoverOrder when we know it's an order create
export async function createOrderWithFailoverDual(mutateFn, args) {
  try {
    const result = await withTimeout(mutateFn(args), 8000);
    return { ...(result || { success: true, orderId: args.orderId }), failover: false };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!isConvexDownError(err) && !msg.includes("Timeout")) throw err;
    return saveFailoverOrder(args);
  }
}
