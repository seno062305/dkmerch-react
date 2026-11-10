/**
 * Client-side Convex → Cloud Firestore mirror (uses existing REACT_APP_FIREBASE_* config).
 * Collections are created automatically on first successful document write.
 */
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

const SECRET_FIELDS = new Set([
  "password",
  "pin",
  "loginOtp",
  "loginOtpExpiresAt",
  "reactivationOtp",
  "reactivationOtpExpiresAt",
  "deliveryOtp",
]);

function sanitizeDoc(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (SECRET_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    if (typeof v === "string" && v.length > 900000) {
      out[k] = `[omitted large field: ${v.length} chars]`;
      continue;
    }
    out[k] = v;
  }
  out._convexId = String(row?._id ?? "");
  out._mirroredAt = Date.now();
  return out;
}

/**
 * @param {Record<string, any[]>} tablesMap
 * @param {(info: { collection: string, synced: number, failed: number }) => void} [onProgress]
 */
export async function mirrorTablesToFirebase(tablesMap, onProgress) {
  let synced = 0;
  let failed = 0;
  const errors = [];
  const collections = Object.keys(tablesMap || {});

  for (const collection of collections) {
    const rows = Array.isArray(tablesMap[collection]) ? tablesMap[collection] : [];
    let batch = writeBatch(db);
    let ops = [];

    const flush = async () => {
      if (ops.length === 0) return;
      try {
        await batch.commit();
        synced += ops.length;
      } catch (batchErr) {
        // Fallback one-by-one so we still create collections / surface permission errors
        for (const { id, data } of ops) {
          try {
            await setDoc(doc(db, collection, id), data, { merge: true });
            synced += 1;
          } catch (err) {
            failed += 1;
            if (errors.length < 5) {
              errors.push(String(err?.message || err).slice(0, 160));
            }
          }
        }
        if (errors.length < 5) {
          errors.push(String(batchErr?.message || batchErr).slice(0, 160));
        }
      }
      batch = writeBatch(db);
      ops = [];
    };

    for (const row of rows) {
      const id = String(row?._id || "");
      if (!id) {
        failed += 1;
        continue;
      }
      const data = sanitizeDoc(row);
      batch.set(doc(db, collection, id), data, { merge: true });
      ops.push({ id, data });
      if (ops.length >= 400) await flush();
    }
    await flush();

    if (typeof onProgress === "function") {
      onProgress({ collection, synced, failed });
    }
  }

  const message =
    failed === 0
      ? `Synced ${synced} docs to Firestore (${collections.length} collections).`
      : `Synced ${synced} docs, ${failed} failed. ${errors.join(" | ")}`;

  return {
    success: failed === 0 && synced > 0,
    synced,
    failed,
    collections: collections.length,
    message,
    permissionDenied: errors.some((e) => /permission|insufficient/i.test(e)),
  };
}

export function getFirebaseClientConfigStatus() {
  const required = [
    "REACT_APP_FIREBASE_API_KEY",
    "REACT_APP_FIREBASE_PROJECT_ID",
    "REACT_APP_FIREBASE_APP_ID",
  ];
  const missing = required.filter((k) => !process.env[k]);
  return {
    ok: missing.length === 0,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "",
    missing,
  };
}
