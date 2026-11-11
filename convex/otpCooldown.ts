import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const STREAK_RESET_MS = 20 * 60 * 1000; // idle 20m → start over at 30s

/** Escalating wait AFTER each successful OTP email: 30s → 1m → 2m → 3m → 5m cap */
export function nextOtpCooldownSec(sendCountAfterThisSend: number): number {
  const n = Math.max(1, Math.floor(sendCountAfterThisSend));
  if (n <= 1) return 30;
  if (n === 2) return 60;
  if (n === 3) return 120;
  if (n === 4) return 180;
  return 300;
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Shared gate for every OTP / verification email.
 * Returns ok:false with waitSec when still cooling down.
 */
export const consumeEmailOtpSend = internalMutation({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    if (!key || !key.includes("@")) {
      return { ok: false as const, message: "Please enter a valid email address.", waitSec: 0 };
    }

    const now = Date.now();
    const row = await db
      .query("emailOtpCooldowns")
      .withIndex("by_email", (q) => q.eq("email", key))
      .first();

    if (row && row.nextAllowedAt > now) {
      const waitSec = Math.max(1, Math.ceil((row.nextAllowedAt - now) / 1000));
      return {
        ok: false as const,
        rateLimited: true as const,
        waitSec,
        cooldownSec: waitSec,
        message: `Please wait ${waitSec}s before requesting another code.`,
      };
    }

    let sendCount = 1;
    if (row) {
      const idle = now - (row.lastSentAt || 0);
      sendCount = idle >= STREAK_RESET_MS ? 1 : Math.max(1, (row.sendCount || 0) + 1);
    }
    const cooldownSec = nextOtpCooldownSec(sendCount);
    const nextAllowedAt = now + cooldownSec * 1000;

    if (row) {
      await db.patch(row._id, {
        sendCount,
        lastSentAt: now,
        nextAllowedAt,
      });
    } else {
      await db.insert("emailOtpCooldowns", {
        email: key,
        sendCount,
        lastSentAt: now,
        nextAllowedAt,
      });
    }

    return {
      ok: true as const,
      sendCount,
      cooldownSec,
      nextAllowedAt,
    };
  },
});

/** Public peek (optional UI); does not consume. */
export const getEmailOtpCooldown = query({
  args: { email: v.string() },
  handler: async ({ db }, { email }) => {
    const key = normalizeEmail(email);
    if (!key) return { waitSec: 0, nextAllowedAt: 0 };
    const row = await db
      .query("emailOtpCooldowns")
      .withIndex("by_email", (q) => q.eq("email", key))
      .first();
    if (!row) return { waitSec: 0, nextAllowedAt: 0 };
    const now = Date.now();
    if (row.nextAllowedAt <= now) return { waitSec: 0, nextAllowedAt: row.nextAllowedAt };
    return {
      waitSec: Math.max(1, Math.ceil((row.nextAllowedAt - now) / 1000)),
      nextAllowedAt: row.nextAllowedAt,
      sendCount: row.sendCount,
    };
  },
});

/** Public consume for mutations that generate OTP without going through sendEmail actions. */
export const consumeOtpEmailCooldown = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Reuse same logic via direct db (same as internal)
    const key = normalizeEmail(email);
    if (!key || !key.includes("@")) {
      return { ok: false as const, message: "Please enter a valid email address.", waitSec: 0 };
    }
    const { db } = ctx;
    const now = Date.now();
    const row = await db
      .query("emailOtpCooldowns")
      .withIndex("by_email", (q) => q.eq("email", key))
      .first();

    if (row && row.nextAllowedAt > now) {
      const waitSec = Math.max(1, Math.ceil((row.nextAllowedAt - now) / 1000));
      return {
        ok: false as const,
        rateLimited: true as const,
        waitSec,
        cooldownSec: waitSec,
        message: `Please wait ${waitSec}s before requesting another code.`,
      };
    }

    let sendCount = 1;
    if (row) {
      const idle = now - (row.lastSentAt || 0);
      sendCount = idle >= STREAK_RESET_MS ? 1 : Math.max(1, (row.sendCount || 0) + 1);
    }
    const cooldownSec = nextOtpCooldownSec(sendCount);
    const nextAllowedAt = now + cooldownSec * 1000;

    if (row) {
      await db.patch(row._id, { sendCount, lastSentAt: now, nextAllowedAt });
    } else {
      await db.insert("emailOtpCooldowns", {
        email: key,
        sendCount,
        lastSentAt: now,
        nextAllowedAt,
      });
    }
    return { ok: true as const, sendCount, cooldownSec, nextAllowedAt };
  },
});
