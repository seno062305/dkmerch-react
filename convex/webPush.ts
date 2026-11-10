"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import * as webpush from "web-push";

const PUBLIC_SITE_URL = "https://dkmerchwebsite.vercel.app";

function resolveSiteUrl(): string {
  const raw = String(process.env.SITE_URL || PUBLIC_SITE_URL).trim().replace(/\/$/, "");
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) return PUBLIC_SITE_URL;
  return raw;
}

function configureVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:dkmerchtest@gmail.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/** Send a system notification to all devices subscribed for this customer email. */
export const sendToEmail = internalAction({
  args: {
    email: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sent: number }> => {
    const email = String(args.email || "").trim().toLowerCase();
    if (!email) return { success: false, sent: 0 };

    try {
      configureVapid();
    } catch (err) {
      console.error("[webPush]", err);
      return { success: false, sent: 0 };
    }

    const subs: any[] = await ctx.runQuery(internal.pushSubscriptions.listByEmailInternal, {
      email,
    });
    if (!subs?.length) return { success: true, sent: 0 };

    const site = resolveSiteUrl();
    const path = args.url || "/";
    const absoluteUrl = path.startsWith("http") ? path : `${site}${path.startsWith("/") ? "" : "/"}${path}`;
    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: absoluteUrl,
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode || err?.status;
        console.error("[webPush] send failed", status, err?.message);
        // Gone / invalid subscription — drop it
        if (status === 404 || status === 410) {
          try {
            await ctx.runMutation(internal.pushSubscriptions.removeSubscriptionInternal, {
              endpoint: sub.endpoint,
            });
          } catch { /* ignore */ }
        }
      }
    }
    return { success: true, sent };
  },
});
