/**
 * DKMerch failover Cloud Functions
 * - PayMongo checkout link (independent of Convex)
 * - Order / pay-now email via Brevo or Resend
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase functions:secrets:set PAYMONGO_SECRET_KEY
 *   firebase functions:secrets:set BREVO_API_KEY   (optional if RESEND set)
 *   firebase functions:secrets:set RESEND_API_KEY  (optional if BREVO set)
 *   firebase functions:secrets:set FAILOVER_FN_SECRET
 *   firebase functions:config:set site.url="https://dkmerchwebsite.vercel.app"  (legacy) OR set SITE_URL env
 *   firebase deploy --only functions
 *
 * Client env:
 *   REACT_APP_FAILOVER_FN_URL=https://<region>-<project>.cloudfunctions.net/failoverCheckoutAssist
 *   REACT_APP_FAILOVER_FN_SECRET=<same as FAILOVER_FN_SECRET>
 */
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const PAYMONGO_SECRET_KEY = defineSecret("PAYMONGO_SECRET_KEY");
const FAILOVER_FN_SECRET = defineSecret("FAILOVER_FN_SECRET");
const SITE_URL = defineString("SITE_URL", { default: "https://dkmerchwebsite.vercel.app" });
// Optional (set as params / env — not required secrets so deploy works with one provider)
const BREVO_API_KEY = defineString("BREVO_API_KEY", { default: "" });
const RESEND_API_KEY = defineString("RESEND_API_KEY", { default: "" });

function toBase64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Failover-Secret");
}

function requireSecret(req) {
  const expected = FAILOVER_FN_SECRET.value();
  const got = req.get("X-Failover-Secret") || req.body?.secret || "";
  if (!expected || got !== expected) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}

async function createPayMongoCheckout({
  orderId,
  amount,
  description,
  customerName,
  customerEmail,
  customerPhone,
}) {
  const secretKey = PAYMONGO_SECRET_KEY.value();
  if (!secretKey) throw new Error("PAYMONGO_SECRET_KEY not set");

  const baseUrl = SITE_URL.value() || "https://dkmerchwebsite.vercel.app";
  const encoded = toBase64(`${secretKey}:`);

  const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${encoded}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          billing: {
            name: customerName || "Customer",
            email: customerEmail || "customer@dkmerch.com",
            phone: customerPhone || "",
          },
          line_items: [
            {
              currency: "PHP",
              amount: Math.round(Number(amount) * 100),
              description: description || `DKMerch Order ${orderId}`,
              name: description || `DKMerch Order ${orderId}`,
              quantity: 1,
            },
          ],
          payment_method_types: ["gcash", "paymaya"],
          success_url: `${baseUrl}/order-success?orderId=${encodeURIComponent(orderId)}`,
          cancel_url: `${baseUrl}/checkout`,
          description: orderId,
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
        },
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.detail || data?.error || JSON.stringify(data));
  }

  const session = data.data;
  return {
    paymentLinkId: session.id,
    paymentLinkUrl: session.attributes.checkout_url,
  };
}

async function sendEmail({ to, subject, html }) {
  const brevoKey = BREVO_API_KEY.value() || process.env.BREVO_API_KEY || "";
  const resendKey = RESEND_API_KEY.value() || process.env.RESEND_API_KEY || "";

  if (brevoKey) {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "DKMerch", email: "dkmerchtest@gmail.com" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    const brevoData = await brevoRes.json();
    if (brevoRes.ok) return { success: true, provider: "brevo", id: brevoData.messageId };
    console.error("Brevo error", brevoData);
  }

  if (resendKey) {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "DKMerch <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    const resendData = await resendRes.json();
    if (resendRes.ok) return { success: true, provider: "resend", id: resendData.id };
    console.error("Resend error", resendData);
    return { success: false, message: resendData.message || "Email failed" };
  }

  return { success: false, message: "No email API key configured" };
}

function payNowEmailHtml({ name, orderId, amount, paymentLinkUrl }) {
  const shortId = String(orderId).slice(-8).toUpperCase();
  const baseUrl = SITE_URL.value() || "https://dkmerchwebsite.vercel.app";
  return `
  <div style="font-family:Segoe UI,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee;">
    <div style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:28px;text-align:center;color:#fff;">
      <h1 style="margin:0 0 6px;font-size:22px;">Complete your payment</h1>
      <p style="margin:0;opacity:.9;font-size:13px;">DKMerch · Order #${shortId}</p>
    </div>
    <div style="padding:24px;">
      <p style="color:#334155;font-size:14px;line-height:1.6;">
        Hi <strong>${name || "Customer"}</strong>, your order was saved while our main system was temporarily offline.
        You can still pay now securely via PayMongo (GCash / Maya).
      </p>
      <p style="font-size:18px;font-weight:800;color:#0f172a;margin:18px 0;">
        Amount due: ₱${Number(amount || 0).toLocaleString("en-PH")}
      </p>
      <p style="text-align:center;margin:24px 0;">
        <a href="${paymentLinkUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;">
          Pay now
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;">
        Track later: <a href="${baseUrl}/track-order?orderId=${encodeURIComponent(orderId)}">${baseUrl}/track-order</a>
      </p>
    </div>
  </div>`;
}

async function patchFailoverPayment(orderId, payment) {
  const patch = {
    paymentLinkId: payment.paymentLinkId,
    paymentLinkUrl: payment.paymentLinkUrl,
    paymentStatus: "pending",
    _needsPayment: false,
    _paymentVia: "firebase-fn",
    _paymentAt: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Legacy collection
  try {
    await db.collection("failover_orders").doc(orderId).set(patch, { merge: true });
  } catch (e) {
    console.warn("failover_orders patch failed", e.message);
  }

  // Generic writes: find pending order creates for this orderId
  try {
    const snap = await db
      .collection("failover_writes")
      .where("table", "==", "orders")
      .where("_syncStatus", "==", "pending")
      .limit(50)
      .get();
    const batch = db.batch();
    let n = 0;
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const oid = d?.args?.orderId || d?.payload?.orderId || d?.docKey;
      if (String(oid) === String(orderId)) {
        batch.set(
          doc.ref,
          {
            ...patch,
            args: {
              ...(d.args || {}),
              paymentLinkId: payment.paymentLinkId,
              paymentLinkUrl: payment.paymentLinkUrl,
              paymentStatus: "pending",
            },
            payload: {
              ...(d.payload || {}),
              paymentLinkId: payment.paymentLinkId,
              paymentLinkUrl: payment.paymentLinkUrl,
              paymentStatus: "pending",
            },
          },
          { merge: true }
        );
        n += 1;
      }
    });
    if (n) await batch.commit();
  } catch (e) {
    console.warn("failover_writes patch failed", e.message);
  }
}

exports.failoverCheckoutAssist = onRequest(
  {
    region: "asia-southeast1",
    secrets: [PAYMONGO_SECRET_KEY, FAILOVER_FN_SECRET],
    timeoutSeconds: 60,
    cors: true,
  },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "POST only" });
      return;
    }

    try {
      requireSecret(req);
      const body = req.body || {};
      const {
        orderId,
        amount,
        description,
        customerName,
        customerEmail,
        customerPhone,
        sendEmail: doEmail = true,
      } = body;

      if (!orderId || amount == null) {
        res.status(400).json({ success: false, message: "orderId and amount required" });
        return;
      }

      const payment = await createPayMongoCheckout({
        orderId,
        amount,
        description,
        customerName,
        customerEmail,
        customerPhone,
      });

      await patchFailoverPayment(orderId, payment);

      let emailResult = { success: false, skipped: true };
      if (doEmail && customerEmail) {
        emailResult = await sendEmail({
          to: customerEmail,
          subject: `DKMerch — Complete payment for order ${String(orderId).slice(-8).toUpperCase()}`,
          html: payNowEmailHtml({
            name: customerName,
            orderId,
            amount,
            paymentLinkUrl: payment.paymentLinkUrl,
          }),
        });
      }

      res.json({
        success: true,
        failover: true,
        paymentLinkId: payment.paymentLinkId,
        paymentLinkUrl: payment.paymentLinkUrl,
        email: emailResult,
      });
    } catch (err) {
      console.error("failoverCheckoutAssist error", err);
      res.status(err.status || 500).json({
        success: false,
        message: String(err.message || err),
      });
    }
  }
);
