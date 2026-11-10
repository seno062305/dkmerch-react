/**
 * Call Firebase Cloud Function for PayMongo + email while Convex is down.
 *
 * Env:
 *   REACT_APP_FAILOVER_FN_URL=https://asia-southeast1-<project>.cloudfunctions.net/failoverCheckoutAssist
 *   REACT_APP_FAILOVER_FN_SECRET=<shared secret>
 */

export async function failoverCheckoutAssist({
  orderId,
  amount,
  description,
  customerName,
  customerEmail,
  customerPhone,
  sendEmail = true,
}) {
  const url = process.env.REACT_APP_FAILOVER_FN_URL;
  const secret = process.env.REACT_APP_FAILOVER_FN_SECRET;

  if (!url) {
    throw new Error("REACT_APP_FAILOVER_FN_URL is not configured");
  }
  if (!secret) {
    throw new Error("REACT_APP_FAILOVER_FN_SECRET is not configured");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Failover-Secret": secret,
    },
    body: JSON.stringify({
      orderId,
      amount,
      description,
      customerName,
      customerEmail,
      customerPhone,
      sendEmail,
      secret,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `Failover pay/email failed (HTTP ${res.status})`);
  }
  return data;
}

export function isFailoverPayConfigured() {
  return !!(process.env.REACT_APP_FAILOVER_FN_URL && process.env.REACT_APP_FAILOVER_FN_SECRET);
}
