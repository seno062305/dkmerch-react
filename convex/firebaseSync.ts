"use node";

/**
 * Convex → Cloud Firestore mirror (backup / 2nd database).
 *
 * Setup (one-time):
 * 1. Firebase Console → Project settings → Service accounts → Generate new private key
 * 2. Convex Dashboard → Settings → Environment Variables:
 *      FIREBASE_SERVICE_ACCOUNT_JSON = {full JSON of the key file}
 *      FIREBASE_PROJECT_ID           = dkmerch   (or your project id)
 * 3. Lock Firestore rules to admin/service-only (do not leave open write).
 */
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import crypto from "crypto";

const SECRET_FIELDS = new Set([
  "password",
  "pin",
  "loginOtp",
  "loginOtpExpiresAt",
  "reactivationOtp",
  "reactivationOtpExpiresAt",
  "deliveryOtp",
]);

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

function readServiceAccount(): { sa: ServiceAccount; projectId: string } {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON in Convex env. Add the Firebase service-account JSON key."
    );
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error("Service account JSON must include client_email and private_key.");
  }
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    sa.project_id ||
    "";
  if (!projectId) {
    throw new Error("Set FIREBASE_PROJECT_ID (or include project_id in the service account JSON).");
  }
  return { sa, projectId };
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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
  const signature = base64url(signer.sign(sa.private_key));
  const jwt = `${unsigned}.${signature}`;

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
    throw new Error(data.error_description || data.error || "Failed to get Firebase access token.");
  }
  return data.access_token as string;
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
    return {
      arrayValue: {
        values: value.map((v) => toFirestoreValue(v)),
      },
    };
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

function sanitizeDoc(row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_FIELDS.has(k)) continue;
    // Skip huge binary-ish blobs that often break Firestore doc size
    if (typeof v === "string" && v.length > 900_000) {
      out[k] = `[omitted large field: ${v.length} chars]`;
      continue;
    }
    out[k] = v;
  }
  out._convexId = String(row._id ?? "");
  out._mirroredAt = Date.now();
  return out;
}

async function upsertDoc(
  projectId: string,
  token: string,
  collection: string,
  docId: string,
  data: Record<string, any>
) {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;

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
    throw new Error(
      err?.error?.message || `Firestore write failed (${collection}/${docId}): HTTP ${res.status}`
    );
  }
}

export const syncAllToFirebase = internalAction({
  args: {},
  handler: async (ctx) => {
    const { sa, projectId } = readServiceAccount();
    const token = await getAccessToken(sa);
    const tables = await ctx.runQuery(internal.backup.getAllForFirebaseMirror);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [collection, rows] of Object.entries(tables)) {
      for (const row of rows as any[]) {
        try {
          const id = String(row._id);
          const data = sanitizeDoc(row);
          await upsertDoc(projectId, token, collection, id, data);
          synced += 1;
        } catch (err: any) {
          failed += 1;
          if (errors.length < 5) {
            errors.push(String(err?.message || err).slice(0, 160));
          }
        }
      }
    }

    const message =
      failed === 0
        ? `Synced ${synced} docs to Firestore (${projectId}).`
        : `Synced ${synced} docs, ${failed} failed. ${errors.join(" | ")}`;

    await ctx.runMutation(internal.backup.recordFirebaseSyncResult, {
      ok: failed === 0,
      message,
      synced,
      failed,
    });

    return { success: failed === 0, synced, failed, message };
  },
});

/** Admin-triggered sync from System Maintenance UI. */
export const syncNow = action({
  args: {},
  handler: async (ctx) => {
    try {
      return await ctx.runAction(internal.firebaseSync.syncAllToFirebase, {});
    } catch (err: any) {
      const message = String(err?.message || err || "Firebase sync failed.");
      try {
        await ctx.runMutation(internal.backup.recordFirebaseSyncResult, {
          ok: false,
          message,
          synced: 0,
          failed: 0,
        });
      } catch {}
      return { success: false, synced: 0, failed: 0, message };
    }
  },
});
