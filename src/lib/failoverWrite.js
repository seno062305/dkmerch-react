/**
 * Generic Convex → Firebase failover for durable writes.
 * Collection: failover_writes
 *
 * When Convex is down/timeout, client saves { table, mutation, args, payload }
 * so sync-back can replay into Convex later.
 */
import { useCallback } from "react";
import { useMutation } from "convex/react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

export const FAILOVER_WRITES = "failover_writes";
export const FAILOVER_ORDERS_LEGACY = "failover_orders";

const CONVEX_TIMEOUT_MS = 8000;

const SECRET_FIELDS = new Set([
  "password",
  "pin",
  "loginOtp",
  "loginOtpExpiresAt",
  "reactivationOtp",
  "reactivationOtpExpiresAt",
  "deliveryOtp",
  "otp",
]);

export function withTimeout(promise, ms = CONVEX_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    Promise.resolve(promise)
      .then((v) => { clearTimeout(t); resolve(v); })
      .catch((err) => { clearTimeout(t); reject(err); });
  });
}

export function isConvexDownError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("connection") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("convex")
  );
}

function sanitize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_FIELDS.has(k)) {
      // Keep password for registration failover only — marked separately
      if (k === "password") {
        out[k] = v;
        out._hasPassword = true;
      }
      continue;
    }
    out[k] = sanitize(v);
  }
  return out;
}

function safeDocId(parts) {
  return String(parts.filter(Boolean).join("_"))
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 700);
}

/**
 * @param {object} opts
 * @param {string} opts.table
 * @param {string} opts.mutation  e.g. "cart:addToCart"
 * @param {object} opts.args
 * @param {string} [opts.docKey]
 * @param {object} [opts.payload]
 * @param {boolean} [opts.needsEmail]
 * @param {boolean} [opts.needsPayment]
 */
export async function saveFailoverWrite({
  table,
  mutation,
  args,
  docKey,
  payload,
  needsEmail = false,
  needsPayment = false,
}) {
  const key = docKey || `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const id = safeDocId([table, key, String(Date.now())]);

  const body = {
    table: String(table),
    mutation: String(mutation || table),
    docKey: String(key),
    args: sanitize(args || {}),
    payload: sanitize(payload || args || {}),
    _failover: true,
    _syncStatus: "pending",
    _failoverAt: Date.now(),
    _syncedAt: null,
    _convexId: null,
    _needsEmail: !!needsEmail,
    _needsPayment: !!needsPayment,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, FAILOVER_WRITES, id), body, { merge: true });

  try {
    const lsKey = "dkmerch_failover_writes_local";
    const prev = JSON.parse(localStorage.getItem(lsKey) || "[]");
    const next = [{ id, table, mutation: body.mutation, at: Date.now() }, ...prev].slice(0, 100);
    localStorage.setItem(lsKey, JSON.stringify(next));
  } catch {}

  return {
    success: true,
    failover: true,
    failoverId: id,
    table,
    message: `Saved to Firebase failover (${table}).`,
  };
}

/**
 * Try Convex mutation; on outage → Firebase failover_writes.
 */
export async function runWithFailover(mutateFn, args, meta) {
  try {
    const result = await withTimeout(mutateFn(args), CONVEX_TIMEOUT_MS);
    return { ...(result && typeof result === "object" ? result : { success: true, result }), failover: false };
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (!isConvexDownError(err) && !msg.includes("Timeout")) throw err;
    console.warn(`[failover] Convex down — queue ${meta?.mutation || meta?.table}:`, err);
    return saveFailoverWrite({
      table: meta.table,
      mutation: meta.mutation || meta.table,
      args,
      docKey: typeof meta.docKey === "function" ? meta.docKey(args) : meta.docKey,
      payload: typeof meta.payload === "function" ? meta.payload(args) : (meta.payload || args),
      needsEmail: !!meta.needsEmail,
      needsPayment: !!meta.needsPayment,
    });
  }
}

/**
 * React hook: wrap a Convex mutation with Firebase failover.
 * metaFromArgs(args) → { table, mutation, docKey, payload?, needsEmail?, needsPayment? }
 */
export function useFailoverMutation(mutationRef, metaFromArgs) {
  const mutate = useMutation(mutationRef);
  return useCallback(
    (args) => {
      const meta = typeof metaFromArgs === "function" ? metaFromArgs(args) : (metaFromArgs || {});
      return runWithFailover(mutate, args, meta);
    },
    // metaFromArgs often inline — intentionally depend on mutate only
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate]
  );
}
