"use node";

/**
 * Firebase failover_orders → Convex sync-back.
 * When Convex is back online, pending client-written failover orders are imported.
 */
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import crypto from "crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

function readServiceAccount(): { sa: ServiceAccount; projectId: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in Convex env.");
  }
  const sa = JSON.parse(raw) as ServiceAccount;
  const projectId = process.env.FIREBASE_PROJECT_ID || sa.project_id || "";
  if (!sa?.client_email || !sa?.private_key || !projectId) {
    throw new Error("Invalid Firebase service account / project id.");
  }
  return { sa, projectId };
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const jwt = `${unsigned}.${base64url(signer.sign(sa.private_key))}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Firebase token failed");
  }
  return data.access_token as string;
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== "object") return null;
  if ("nullValue" in val) return null;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number(val.integerValue);
  if ("doubleValue" in val) return Number(val.doubleValue);
  if ("stringValue" in val) return val.stringValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    return (val.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in val) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function docToObject(doc: any): Record<string, any> {
  const fields = doc?.fields || {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  const name: string = doc?.name || "";
  const id = name.split("/").pop() || "";
  out._firestoreId = id;
  return out;
}

function toFirestoreValue(value: unknown): any {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function listCollectionDocs(projectId: string, token: string, collection: string) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${encodeURIComponent(collection)}?pageSize=200`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    // Empty collection is fine
    if (res.status === 404) return [];
    throw new Error(data?.error?.message || `List ${collection} failed: HTTP ${res.status}`);
  }
  return (data.documents || []).map(docToObject);
}

async function patchCollectionDoc(
  projectId: string,
  token: string,
  collection: string,
  docId: string,
  patch: Record<string, any>
) {
  const fields: Record<string, any> = {};
  const mask: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields[k] = toFirestoreValue(v);
    mask.push(k);
  }
  const qs = mask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}?${qs}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Patch ${collection}/${docId} failed: HTTP ${res.status}`);
  }
}

export const syncFailoverOrdersToConvex = internalAction({
  args: {},
  handler: async (ctx) => {
    const { sa, projectId } = readServiceAccount();
    const token = await getAccessToken(sa);

    const writeDocs = await listCollectionDocs(projectId, token, "failover_writes");
    const legacyOrders = await listCollectionDocs(projectId, token, "failover_orders");

    // Normalize legacy order docs into write-shaped objects
    const legacyAsWrites = legacyOrders.map((doc: any) => ({
      ...doc,
      table: "orders",
      mutation: "orders:createOrder",
      args: doc,
      payload: doc,
      _legacyCollection: "failover_orders",
      _legacyId: String(doc.orderId || doc._firestoreId || ""),
    }));

    const all = [
      ...writeDocs.map((d: any) => ({
        ...d,
        _legacyCollection: "failover_writes",
        _legacyId: String(d._firestoreId || d.docKey || ""),
      })),
      ...legacyAsWrites,
    ];

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let paymentQueued = 0;
    let emailQueued = 0;
    const errors: string[] = [];

    for (const doc of all) {
      const docId = String(doc._legacyId || "");
      const collection = String(doc._legacyCollection || "failover_writes");
      const status = String(doc._syncStatus || "pending");
      if (!docId) {
        skipped += 1;
        continue;
      }
      if (status === "synced") {
        skipped += 1;
        continue;
      }

      try {
        const result: any = await ctx.runMutation(internal.failoverApply.applyFailoverWrite, {
          write: doc,
        });

        if (result?.ok) {
          await patchCollectionDoc(projectId, token, collection, docId, {
            _syncStatus: "synced",
            _syncedAt: Date.now(),
            _convexId: String(result.convexId || ""),
            _syncReason: String(result.reason || "ok"),
          });
          if (result.reason === "inserted" || result.reason === "inserted_pending") imported += 1;
          else skipped += 1;
          if (result.needsPayment || doc._needsPayment) paymentQueued += 1;
          if (result.needsEmail || doc._needsEmail) emailQueued += 1;
        } else if (result?.deferred) {
          // Keep pending for a later pass / manual handling
          skipped += 1;
        } else {
          await patchCollectionDoc(projectId, token, collection, docId, {
            _syncStatus: "error",
            _syncError: String(result?.reason || "failed").slice(0, 200),
          });
          failed += 1;
        }
      } catch (err: any) {
        failed += 1;
        if (errors.length < 5) errors.push(String(err?.message || err).slice(0, 160));
        try {
          await patchCollectionDoc(projectId, token, collection, docId, {
            _syncStatus: "error",
            _syncError: String(err?.message || err).slice(0, 200),
          });
        } catch {}
      }
    }

    const message =
      `Failover sync-back: imported ${imported}, skipped ${skipped}, failed ${failed}` +
      (paymentQueued || emailQueued
        ? ` · paymentQueued=${paymentQueued} emailQueued=${emailQueued}`
        : "") +
      (errors.length ? `. ${errors.join(" | ")}` : ".");

    try {
      await ctx.runMutation(internal.backup.recordFirebaseSyncResult, {
        ok: failed === 0,
        message,
        synced: imported,
        failed,
      });
    } catch {}

    return { success: failed === 0, imported, skipped, failed, paymentQueued, emailQueued, message };
  },
});

/** Manual trigger from admin UI. */
export const syncFailoverNow = action({
  args: {},
  handler: async (ctx) => {
    try {
      return await ctx.runAction(internal.failoverSync.syncFailoverOrdersToConvex, {});
    } catch (err: any) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        failed: 0,
        message: String(err?.message || err || "Failover sync-back failed."),
      };
    }
  },
});
