import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const TTL_MS = 3 * 60 * 1000; // 3 minutes

function randomToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Desktop: create a one-time QR login session. */
export const createSession = mutation({
  args: {},
  handler: async ({ db }) => {
    const now = Date.now();
    const token = randomToken();
    await db.insert("quickSignInSessions", {
      token,
      status: "pending",
      createdAt: now,
      expiresAt: now + TTL_MS,
    });
    return { success: true, token, expiresAt: now + TTL_MS };
  },
});

/** Desktop: poll until mobile approves (or expiry). */
export const getSession = query({
  args: { token: v.string() },
  handler: async ({ db }, { token }) => {
    const t = String(token || "").trim();
    if (!t) return null;
    const row = await db
      .query("quickSignInSessions")
      .withIndex("by_token", (q) => q.eq("token", t))
      .first();
    if (!row) return null;

    const expired = Date.now() > row.expiresAt;
    if (expired && row.status === "pending") {
      return { ...row, status: "expired" as const };
    }
    return row;
  },
});

/**
 * Mobile (logged-in customer): approve desktop QR session.
 * Passes the signed-in account onto the desktop browser.
 */
export const approveSession = mutation({
  args: {
    token: v.string(),
    email: v.string(),
  },
  handler: async ({ db }, { token, email }) => {
    const t = String(token || "").trim();
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!t) return { success: false, error: "Invalid QR code." };
    if (!emailNorm) return { success: false, error: "You must be logged in to approve." };

    const row = await db
      .query("quickSignInSessions")
      .withIndex("by_token", (q) => q.eq("token", t))
      .first();
    if (!row) return { success: false, error: "QR code not found or already used." };
    if (Date.now() > row.expiresAt) {
      await db.patch(row._id, { status: "expired" });
      return { success: false, error: "This QR code expired. Generate a new one on desktop." };
    }
    if (row.status !== "pending") {
      return { success: false, error: "This QR code was already used." };
    }

    let user = await db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", emailNorm))
      .first();
    if (!user) {
      // Fallback if older accounts stored mixed-case emails
      const all = await db.query("users").collect();
      user = all.find((u) => String(u.email || "").trim().toLowerCase() === emailNorm) || null;
    }
    if (!user) return { success: false, error: "Account not found." };
    if (user.role !== "user") {
      return { success: false, error: "Only customer accounts can use Quick Sign In." };
    }
    if (user.status === "suspended" || user.status === "deactivated" || user.deletedAt) {
      return { success: false, error: "This account cannot sign in right now." };
    }

    await db.patch(row._id, {
      status: "approved",
      approvedAt: Date.now(),
      userId: String(user._id),
      userEmail: user.email,
      userName: user.name,
      username: user.username,
      phone: user.phone || "",
      role: "user",
    });

    return { success: true };
  },
});

/** Desktop: mark session consumed after login applied. */
export const consumeSession = mutation({
  args: { token: v.string() },
  handler: async ({ db }, { token }) => {
    const t = String(token || "").trim();
    if (!t) return { success: false };
    const row = await db
      .query("quickSignInSessions")
      .withIndex("by_token", (q) => q.eq("token", t))
      .first();
    if (!row) return { success: false };
    if (row.status === "approved") {
      await db.patch(row._id, { status: "consumed" });
    }
    return { success: true };
  },
});
