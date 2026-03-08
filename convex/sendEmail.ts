// convex/sendEmail.ts
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const SITE_URL = process.env.SITE_URL || "https://dkmerchwebsite.vercel.app";

const TEST_EMAIL = "dkmerchtest@gmail.com";
const IS_TEST_MODE = false;

// ── BASE EMAIL (internal) ─────────────────────────────────────────────────────

export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  handler: async (
    _ctx,
    { to, subject, html }: { to: string; subject: string; html: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const BREVO_API_KEY = process.env.BREVO_API_KEY;

    if (!BREVO_API_KEY) {
      console.error("BREVO_API_KEY not set.");
      return { success: false, message: "Email service not configured." };
    }

    const actualTo = IS_TEST_MODE ? TEST_EMAIL : to;
    const actualSubject =
      IS_TEST_MODE && to !== TEST_EMAIL
        ? `[TEST → ${to}] ${subject}`
        : subject;

    if (IS_TEST_MODE && to !== TEST_EMAIL) {
      console.log(`[TEST MODE] Redirecting email from "${to}" → "${TEST_EMAIL}"`);
    }

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "DKMerch",
          email: "dkmerchtest@gmail.com",
        },
        to: [{ email: actualTo }],
        subject: actualSubject,
        htmlContent: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Brevo error:", data);
      return { success: false, message: data.message || "Failed to send email." };
    }

    return { success: true, id: data.messageId };
  },
});

// ── REGISTRATION OTP EMAIL ────────────────────────────────────────────────────

export const sendRegistrationOTP = action({
  args: {
    to: v.string(),
    name: v.string(),
    otp: v.string(),
  },
  handler: async (
    ctx,
    { to, name, otp }: { to: string; name: string; otp: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Verify Your DKMerch Account</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:36px 32px;text-align:center;">
          <div style="font-size:32px;font-weight:900;color:white;letter-spacing:1px;">DKMerch</div>
          <div style="color:#ffd6e7;font-size:13px;margin-top:6px;">Your K-Pop Paradise</div>
        </td></tr>
        <tr><td style="background:#fff0f6;padding:28px 32px;text-align:center;border-bottom:1px solid #ffd6e7;">
          <div style="font-size:52px;margin-bottom:10px;">🔐</div>
          <div style="font-size:22px;font-weight:800;color:#42011e;">Email Verification Code</div>
          <div style="font-size:14px;color:#9c27b0;margin-top:6px;">Enter this code to complete your registration</div>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="font-size:16px;color:#374151;margin:0 0 16px;">Hi <strong>${name}</strong>! 👋</p>
          <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 28px;">
            Use the verification code below to confirm your email and complete your DKMerch account registration.
          </p>
          <div style="background:linear-gradient(135deg,#fff0f6,#f5f3ff);border:2px dashed #fc1268;border-radius:16px;padding:28px;text-align:center;margin:0 0 28px;">
            <p style="font-size:12px;font-weight:700;color:#9c27b0;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Your OTP Code</p>
            <div style="font-size:48px;font-weight:900;letter-spacing:12px;color:#fc1268;margin:8px 0;">${otp}</div>
            <p style="font-size:13px;color:#6b7280;margin:10px 0 0;">
              ⏱ This code expires in <strong style="color:#fc1268;">3 minutes</strong>
            </p>
          </div>
          <div style="background:#fffbeb;border-radius:10px;border:1px solid #fde68a;padding:14px 18px;margin-bottom:24px;">
            <p style="font-size:13px;color:#92400e;margin:0;line-height:1.6;">
              🔒 <strong>Security tip:</strong> Never share this code with anyone. DKMerch will never ask for your OTP via chat or call.
            </p>
          </div>
          <div style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;padding:14px 18px;">
            <p style="font-size:13px;color:#166534;margin:0;line-height:1.6;">
              ✅ Go back to the DKMerch registration page and enter this code to verify your email.
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <p style="color:#aaa;font-size:12px;margin:0;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: `${otp} — Your DKMerch Verification Code`,
      html,
    });
  },
});

// ── EMAIL VERIFICATION (link-based — kept for compatibility) ──────────────────

export const sendVerificationEmail = action({
  args: {
    to: v.string(),
    name: v.string(),
    token: v.string(),
  },
  handler: async (
    ctx,
    { to, name, token }: { to: string; name: string; token: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const verifyUrl = `${SITE_URL}/verify-email?token=${token}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Verify Your DKMerch Account</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:36px 32px;text-align:center;">
          <div style="font-size:32px;font-weight:900;color:white;letter-spacing:1px;">DKMerch</div>
          <div style="color:#ffd6e7;font-size:13px;margin-top:6px;">Your K-Pop Paradise</div>
        </td></tr>
        <tr><td style="background:#fff0f6;padding:28px 32px;text-align:center;border-bottom:1px solid #ffd6e7;">
          <div style="font-size:52px;margin-bottom:10px;">✉️</div>
          <div style="font-size:22px;font-weight:800;color:#42011e;">Verify Your Email</div>
          <div style="font-size:14px;color:#9c27b0;margin-top:6px;">One click away from joining DKMerch!</div>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="font-size:16px;color:#374151;margin:0 0 16px;">Hi <strong>${name}</strong>! 👋</p>
          <p style="font-size:14px;color:#6b7280;line-height:1.7;margin:0 0 28px;">
            Thank you for registering at DKMerch! To complete your account setup,
            please verify your email address by clicking the button below.
            <br/><br/>
            This link will expire in <strong style="color:#fc1268;">24 hours</strong>.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:16px;font-weight:800;letter-spacing:0.5px;box-shadow:0 4px 15px rgba(252,18,104,0.4);">
              ✅ Verify My Email
            </a>
          </div>
          <div style="background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;padding:16px 20px;margin-bottom:24px;">
            <p style="font-size:12px;color:#9ca3af;margin:0 0 8px;">Or copy and paste this link into your browser:</p>
            <p style="font-size:12px;color:#fc1268;word-break:break-all;margin:0;font-family:'Courier New',monospace;">${verifyUrl}</p>
          </div>
          <div style="background:#fffbeb;border-radius:10px;border:1px solid #fde68a;padding:14px 18px;">
            <p style="font-size:13px;color:#92400e;margin:0;line-height:1.6;">
              🔒 <strong>Security tip:</strong> If you did not create a DKMerch account, you can safely ignore this email.
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <p style="color:#aaa;font-size:12px;margin:0;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: "✉️ Verify your DKMerch account",
      html,
    });
  },
});

// ── PASSWORD RESET EMAIL ──────────────────────────────────────────────────────

export const sendPasswordResetCode = action({
  args: {
    to: v.string(),
    code: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { to, code, name }: { to: string; code: string; name?: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#fc1268,#9c27b0);padding:32px;text-align:center;">
          <h1 style="color:white;margin:0;font-size:24px;">🔐 Password Reset</h1>
          <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding:32px;">
          <p style="color:#333;font-size:16px;">Hi ${name ?? "there"},</p>
          <p style="color:#555;font-size:15px;">Your verification code to reset your password is:</p>
          <div style="background:#f8f9fa;border:2px dashed #fc1268;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:40px;font-weight:700;letter-spacing:8px;color:#fc1268;">${code}</span>
          </div>
          <p style="color:#888;font-size:13px;">This code expires in 10 minutes.</p>
          <p style="color:#888;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;">
          <p style="color:#aaa;font-size:12px;margin:0;">© 2026 DKMerch · K-Pop Paradise</p>
        </div>
      </div>
    `;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: `${code} — Your DKMerch Password Reset Code`,
      html,
    });
  },
});

// ── ORDER CONFIRMATION EMAIL ──────────────────────────────────────────────────

export const sendOrderConfirmation = action({
  args: {
    to: v.string(),
    name: v.string(),
    orderId: v.string(),
    items: v.array(
      v.object({
        name: v.string(),
        price: v.number(),
        quantity: v.number(),
      })
    ),
    total: v.number(),
    promoCode: v.optional(v.string()),
    promoName: v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    finalTotal: v.optional(v.number()),
    shippingFee: v.optional(v.number()),
    shippingDistanceKm: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      to, name, orderId, items, total,
      promoCode, promoName, discountAmount, finalTotal,
      shippingFee, shippingDistanceKm,
    }: {
      to: string; name: string; orderId: string;
      items: { name: string; price: number; quantity: number }[];
      total: number; promoCode?: string; promoName?: string;
      discountAmount?: number; finalTotal?: number;
      shippingFee?: number; shippingDistanceKm?: number;
    }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const subtotalAmount = total - (shippingFee ?? 0);
    const chargedAmount = finalTotal ?? total;
    const hasPromo = !!(promoCode && discountAmount && discountAmount > 0);

    const itemRows = items.map((item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#333;font-size:14px;">${item.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;color:#555;font-size:14px;">${item.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#333;font-size:14px;">₱${item.price.toLocaleString()}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#fc1268;font-weight:600;font-size:14px;">₱${(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join("");

    const promoRow = hasPromo ? `
      <tr style="background:#f0fdf4;">
        <td colspan="3" style="padding:10px 12px;color:#15803d;font-size:14px;font-weight:600;">
          Promo Code: <span style="font-family:'Courier New',monospace;background:#dcfce7;padding:2px 8px;border-radius:4px;letter-spacing:1px;">${promoCode}</span>
          ${promoName ? `<span style="color:#6b7280;font-size:12px;margin-left:6px;">(${promoName})</span>` : ""}
        </td>
        <td style="padding:10px 12px;text-align:right;color:#16a34a;font-weight:700;font-size:14px;">-₱${discountAmount!.toLocaleString()}</td>
      </tr>
    ` : "";

    const shippingKmLabel = shippingDistanceKm ? ` <span style="font-size:12px;color:#94a3b8;font-weight:400;">(~${shippingDistanceKm} km)</span>` : "";
    const shippingRow = `
      <tr>
        <td colspan="3" style="padding:10px 12px;border-bottom:1px solid #eee;color:#555;font-size:14px;">Shipping Fee${shippingKmLabel}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;color:#333;font-size:14px;">
          ${(shippingFee ?? 0) === 0 ? '<span style="color:#16a34a;font-weight:600;">FREE</span>' : `₱${(shippingFee ?? 0).toLocaleString()}`}
        </td>
      </tr>
    `;

    const summaryShippingLabel = shippingDistanceKm ? `Shipping (~${shippingDistanceKm} km)` : `Shipping`;

    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:620px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
        <div style="background:linear-gradient(135deg,#fc1268,#9c27b0);padding:36px 32px;text-align:center;">
          <h1 style="color:white;margin:0 0 6px;font-size:28px;">Order Confirmed!</h1>
          <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding:32px;">
          <p style="color:#333;font-size:16px;margin-top:0;">Hi <strong>${name}</strong>! Thank you for your order.</p>
          <p style="color:#555;font-size:14px;">Order ID: <strong style="font-family:monospace;font-size:15px;">${orderId}</strong></p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:linear-gradient(135deg,#fc1268,#9c27b0);">
                <th style="padding:12px;text-align:left;color:white;font-size:13px;">Item</th>
                <th style="padding:12px;text-align:center;color:white;font-size:13px;">Qty</th>
                <th style="padding:12px;text-align:right;color:white;font-size:13px;">Unit Price</th>
                <th style="padding:12px;text-align:right;color:white;font-size:13px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${shippingRow}
              ${promoRow}
            </tbody>
          </table>
          <div style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:20px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:6px 0;color:#555;font-size:14px;">Subtotal</td>
                <td style="padding:6px 0;text-align:right;color:#333;font-size:14px;">₱${subtotalAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#555;font-size:14px;">${summaryShippingLabel}</td>
                <td style="padding:6px 0;text-align:right;color:#333;font-size:14px;">${(shippingFee ?? 0) === 0 ? '<span style="color:#16a34a;font-weight:600;">FREE</span>' : `₱${(shippingFee ?? 0).toLocaleString()}`}</td>
              </tr>
              ${hasPromo ? `
              <tr>
                <td style="padding:6px 0;color:#16a34a;font-size:14px;font-weight:600;">Promo Discount (${promoCode})</td>
                <td style="padding:6px 0;text-align:right;color:#16a34a;font-size:14px;font-weight:700;">-₱${discountAmount!.toLocaleString()}</td>
              </tr>` : ""}
              <tr style="border-top:2px solid #e2e8f0;">
                <td style="padding:12px 0 6px;font-size:18px;font-weight:700;color:#1a1a1a;">${hasPromo ? "Total Charged" : "Total"}</td>
                <td style="padding:12px 0 6px;text-align:right;font-size:22px;font-weight:800;color:#fc1268;">₱${chargedAmount.toLocaleString()}</td>
              </tr>
            </table>
          </div>
        </div>
        <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #e9ecef;">
          <p style="color:#aaa;font-size:12px;margin:0;">© 2026 DKMerch · K-Pop Paradise</p>
        </div>
      </div>
    `;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: hasPromo
        ? `Order Confirmed (saved ₱${discountAmount!.toLocaleString()}!) — ${orderId} | DKMerch`
        : `Order Confirmed — ${orderId} | DKMerch`,
      html,
    });
  },
});

// ── PROMO NOTIFICATION — blast to all registered users ────────────────────────

export const sendPromoNotificationToAllUsers = internalAction({
  args: {
    promoCode: v.string(),
    promoName: v.string(),
    discount: v.number(),
    maxDiscount: v.number(),
    startDate: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endDate: v.optional(v.string()),
    endTime: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sent: number }> => {
    const users: { name: string; email: string }[] = await ctx.runQuery(
      internal.users.getAllUsersForPromoNotif, {}
    );

    if (!users || users.length === 0) return { success: true, sent: 0 };

    const fmt12 = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    };

    const fmtDate = (d: string) => {
      const [y, mo, day] = d.split("-").map(Number);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[mo - 1]} ${day}, ${y}`;
    };

    const startLabel = args.startDate
      ? `${fmtDate(args.startDate)}${args.startTime ? ` • ${fmt12(args.startTime)}` : ""}`
      : null;
    const endLabel = args.endDate
      ? `${fmtDate(args.endDate)}${args.endTime ? ` • ${fmt12(args.endTime)}` : ""}`
      : null;

    const scheduleRow = startLabel || endLabel ? `
      <tr>
        <td colspan="2" style="padding:0 0 16px;text-align:center;">
          <span style="display:inline-block;background:rgba(147,51,234,0.1);border:1px solid rgba(147,51,234,0.3);border-radius:20px;padding:6px 16px;font-size:13px;color:#7c3aed;">
            ${startLabel ? `<strong>Start:</strong> ${startLabel}` : ""}${startLabel && endLabel ? " &rarr; " : ""}${endLabel ? `<strong>End:</strong> ${endLabel}` : ""}
          </span>
        </td>
      </tr>
    ` : "";

    let sent = 0;
    for (const user of users) {
      if (!user.email) continue;

      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.12);">
          <div style="background:linear-gradient(135deg,#9333ea,#ec4899,#ef4444);padding:40px 32px;text-align:center;">
            <div style="font-size:48px;margin-bottom:10px;">🔥</div>
            <h1 style="color:white;margin:0 0 8px;font-size:28px;font-weight:900;letter-spacing:1px;">LIMITED TIME PROMO!</h1>
            <p style="color:rgba(255,255,255,0.9);margin:0;font-size:16px;">Exclusive deal for DKMerch shoppers</p>
          </div>
          <div style="padding:36px 32px;text-align:center;">
            <p style="color:#374151;font-size:16px;margin:0 0 24px;">Hi <strong>${user.name}</strong>! A new promo is live for <strong>${args.promoName}</strong> fans!</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${scheduleRow}</table>
            <div style="background:linear-gradient(135deg,#fdf2f8,#f5f3ff);border:2px dashed #ec4899;border-radius:16px;padding:28px;margin:0 0 28px;">
              <p style="color:#6b7280;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Your Promo Code</p>
              <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:900;color:#ec4899;letter-spacing:4px;margin-bottom:14px;">${args.promoCode}</div>
              <div style="background:linear-gradient(135deg,#9333ea,#ec4899);color:white;border-radius:10px;padding:12px 20px;display:inline-block;font-size:18px;font-weight:700;">
                ${args.discount}% OFF
                <span style="font-size:13px;opacity:0.85;margin-left:6px;">(up to ₱${args.maxDiscount.toLocaleString()})</span>
              </div>
            </div>
            <a href="${SITE_URL}/promo/${args.promoCode}" style="display:inline-block;background:linear-gradient(135deg,#9333ea,#ec4899);color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:700;margin-bottom:20px;">
              Shop Now at DKMerch
            </a>
          </div>
          <div style="background:#f8f9fa;padding:16px;text-align:center;border-top:1px solid #e9ecef;">
            <p style="color:#aaa;font-size:12px;margin:0;">© 2026 DKMerch · K-Pop Paradise</p>
          </div>
        </div>
      `;

      await ctx.runAction(internal.sendEmail.sendEmail, {
        to: user.email,
        subject: `🔥 ${args.promoCode} — ${args.discount}% OFF for ${args.promoName} fans! | DKMerch`,
        html,
      });

      await new Promise((r) => setTimeout(r, 600));
      sent++;
    }

    return { success: true, sent };
  },
});

// ── ORDER CONFIRMED EMAIL → CUSTOMER ─────────────────────────────────────────

async function buildOrderConfirmedEmailHtml(args: {
  customerName: string;
  orderId: string;
  total: string;
  itemCount: number;
  shippingAddress: string;
}): Promise<string> {
  const shortId = args.orderId.slice(-8).toUpperCase();
  const trackUrl = `${SITE_URL}/track-order?order=${args.orderId}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Order Confirmed - DKMerch</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">DKMerch</div>
          <div style="color:#ffd6e7;font-size:13px;margin-top:4px;">Your K-Pop Paradise</div>
        </td></tr>
        <tr><td style="background:#d1fae5;padding:20px 36px;text-align:center;border-bottom:1px solid #a7f3d0;">
          <div style="font-size:40px;margin-bottom:8px;">✅</div>
          <div style="font-size:20px;font-weight:800;color:#065f46;">Order Confirmed!</div>
          <div style="font-size:14px;color:#047857;margin-top:4px;">Your order has been reviewed and confirmed by our team.</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${args.customerName}</strong>,</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;border:1.5px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Order ID</td>
                  <td style="font-size:13px;font-weight:700;color:#fc1268;text-align:right;">#${shortId}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Items</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${args.itemCount} item${args.itemCount !== 1 ? "s" : ""}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Total</td>
                  <td style="font-size:14px;font-weight:800;color:#1f2937;text-align:right;">₱${args.total}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;vertical-align:top;">Delivery Address</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;max-width:260px;">${args.shippingAddress}</td>
                </tr>
              </table>
            </td></tr>
          </table>
          <div style="background:#eff6ff;border-radius:12px;border:1.5px solid #bfdbfe;padding:18px 22px;margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">What happens next?</div>
            <div style="font-size:13px;color:#1e40af;line-height:1.7;">
              1. A rider will be assigned to pick up your order.<br/>
              2. You will receive another update when your order is on its way.<br/>
              3. When the rider arrives, provide your <strong>OTP code</strong> to confirm delivery.
            </div>
          </div>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">Track My Order</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const sendOrderConfirmedEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    orderId: v.string(),
    total: v.string(),
    itemCount: v.number(),
    shippingAddress: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; id?: string }> => {
    const shortId = args.orderId.slice(-8).toUpperCase();
    const html = await buildOrderConfirmedEmailHtml(args);
    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to: args.to,
      subject: `✅ Order Confirmed! — Order #${shortId} | DKMerch`,
      html,
    });
  },
});

// ── NEW ORDER EMAIL → ALL APPROVED RIDERS ────────────────────────────────────

export const sendRiderNewOrderEmail = internalAction({
  args: {
    orderId: v.string(),
    customerName: v.string(),
    total: v.string(),
    itemCount: v.number(),
    shippingAddress: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sent: number }> => {
    const riders: { fullName: string; email: string }[] = await ctx.runQuery(
      internal.riders.getAllApprovedRiderEmails, {}
    );

    if (!riders || riders.length === 0) return { success: true, sent: 0 };

    const shortId = args.orderId.slice(-8).toUpperCase();
    const riderUrl = `${SITE_URL}/rider?tab=available`;

    let sent = 0;
    for (const rider of riders) {
      if (!rider.email) continue;

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>New Order Available - DKMerch Rider</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">DKMerch Rider</div>
          <div style="color:#ffd6e7;font-size:13px;margin-top:4px;">Delivery Notification System</div>
        </td></tr>
        <tr><td style="background:#fff7ed;padding:20px 36px;text-align:center;border-bottom:1px solid #fed7aa;">
          <div style="font-size:40px;margin-bottom:8px;">🛵</div>
          <div style="font-size:20px;font-weight:800;color:#7c2d12;">New Order Available!</div>
          <div style="font-size:14px;color:#9a3412;margin-top:4px;">A confirmed order is ready for pickup.</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${rider.fullName}</strong> 👋,</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;border:1.5px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Order ID</td>
                  <td style="font-size:13px;font-weight:700;color:#fc1268;text-align:right;">#${shortId}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Customer</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${args.customerName}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Items</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${args.itemCount} item${args.itemCount !== 1 ? "s" : ""}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Order Total</td>
                  <td style="font-size:14px;font-weight:800;color:#1f2937;text-align:right;">₱${args.total}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;vertical-align:top;">Delivery Address</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;max-width:260px;">${args.shippingAddress}</td>
                </tr>
              </table>
            </td></tr>
          </table>
          <div style="background:#fff7ed;border-radius:12px;border:1.5px solid #fed7aa;padding:18px 22px;margin-bottom:24px;text-align:center;">
            <div style="font-size:12px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🔥 Act Fast!</div>
            <div style="font-size:13px;color:#9a3412;line-height:1.7;margin-bottom:16px;">Open your Rider Dashboard to request this pickup before another rider takes it!</div>
            <a href="${riderUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#ff4d94);color:white;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;">Go to Available Orders</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · Rider Notification System</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      await ctx.runAction(internal.sendEmail.sendEmail, {
        to: rider.email,
        subject: `🛵 New Order Ready for Pickup — #${shortId} | DKMerch`,
        html,
      });

      await new Promise((r) => setTimeout(r, 400));
      sent++;
    }

    return { success: true, sent };
  },
});

// ── REFUND APPROVED EMAIL → CUSTOMER ─────────────────────────────────────────

export const sendRefundApprovedEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    orderId: v.string(),
    refundAmount: v.number(),
    refundMethod: v.string(),
    refundAccountName: v.string(),
    refundAccountNumber: v.string(),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; id?: string }> => {
    const shortId = args.orderId.slice(-8).toUpperCase();
    const methodName = args.refundMethod === "gcash" ? "GCash" : "Maya";
    const trackUrl = `${SITE_URL}/track-order?order=${args.orderId}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Refund Approved - DKMerch</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">DKMerch</div>
        </td></tr>
        <tr><td style="background:#d1fae5;padding:20px 36px;text-align:center;border-bottom:1px solid #a7f3d0;">
          <div style="font-size:40px;margin-bottom:8px;">✅</div>
          <div style="font-size:20px;font-weight:800;color:#065f46;">Refund Approved!</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${args.customerName}</strong>,</p>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 24px;">
            Your refund for Order <strong>#${shortId}</strong> has been approved and sent to your ${methodName} account.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;border:1.5px solid #e5e7eb;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Order ID</td>
                  <td style="font-size:13px;font-weight:700;color:#fc1268;text-align:right;">#${shortId}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Refund Amount</td>
                  <td style="font-size:16px;font-weight:800;color:#065f46;text-align:right;">₱${args.refundAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Sent Via</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${methodName}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Account Name</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${args.refundAccountName}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#6b7280;padding:5px 0;">Account Number</td>
                  <td style="font-size:13px;font-weight:600;color:#1f2937;text-align:right;">${args.refundAccountNumber}</td>
                </tr>
              </table>
            </td></tr>
          </table>
          ${args.adminNote ? `<div style="background:#eff6ff;border-radius:12px;border:1.5px solid #bfdbfe;padding:18px 22px;margin-bottom:24px;"><div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:8px;">Note from Admin</div><div style="font-size:14px;color:#1e40af;line-height:1.6;">${args.adminNote}</div></div>` : ""}
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">View Order Status</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to: args.to,
      subject: `✅ Refund Approved — ₱${args.refundAmount.toLocaleString()} sent to your ${methodName} | DKMerch`,
      html,
    });
  },
});

// ── REFUND REJECTED EMAIL → CUSTOMER ─────────────────────────────────────────

export const sendRefundRejectedEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    orderId: v.string(),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; id?: string }> => {
    const shortId = args.orderId.slice(-8).toUpperCase();
    const trackUrl = `${SITE_URL}/track-order?order=${args.orderId}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Refund Request Update - DKMerch</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">DKMerch</div>
        </td></tr>
        <tr><td style="background:#fef2f2;padding:20px 36px;text-align:center;border-bottom:1px solid #fecaca;">
          <div style="font-size:40px;margin-bottom:8px;">❌</div>
          <div style="font-size:20px;font-weight:800;color:#7f1d1d;">Refund Request Rejected</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${args.customerName}</strong>,</p>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 24px;">
            We were unable to approve your refund request for Order <strong>#${shortId}</strong>.
          </p>
          ${args.adminNote ? `<div style="background:#fef2f2;border-radius:12px;border:1.5px solid #fecaca;padding:18px 22px;margin-bottom:24px;"><div style="font-size:12px;font-weight:700;color:#991b1b;margin-bottom:8px;">Reason</div><div style="font-size:14px;color:#7f1d1d;line-height:1.6;">${args.adminNote}</div></div>` : ""}
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:700;">View Order &amp; Re-submit</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to: args.to,
      subject: `❌ Refund Request Update — Order #${shortId} | DKMerch`,
      html,
    });
  },
});

// ── RIDER APPROVED EMAIL ──────────────────────────────────────────────────────

export const sendRiderApprovedEmail = action({
  args: {
    to: v.string(),
    riderName: v.string(),
    dkRiderId: v.string(),
    email: v.string(),
    vehicleType: v.optional(v.string()),
    plateNumber: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; id?: string }> => {
    const riderUrl = `${SITE_URL}/rider`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>You're Approved! - DKMerch Rider</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#6a0dad,#9b30ff);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">🛵 DKMerch Rider</div>
        </td></tr>
        <tr><td style="background:#d1fae5;padding:20px 36px;text-align:center;border-bottom:1px solid #a7f3d0;">
          <div style="font-size:44px;margin-bottom:8px;">🎉</div>
          <div style="font-size:22px;font-weight:800;color:#065f46;">You're Approved!</div>
          <div style="font-size:14px;color:#047857;margin-top:4px;">Welcome to the DKMerch Rider Team!</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 16px;">Hi <strong>${args.riderName}</strong>! 👋</p>
          <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:0 0 24px;">Your application has been <strong style="color:#059669;">approved</strong>. You can now log in and start accepting deliveries!</p>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${riderUrl}" style="display:inline-block;background:linear-gradient(135deg,#6a0dad,#9b30ff);color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">Go to Rider Dashboard</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · Rider Notification System</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to: args.to,
      subject: `🎉 You're Approved! Welcome to DKMerch Rider Team — ID: ${args.dkRiderId}`,
      html,
    });
  },
});

// ── RIDER ON THE WAY EMAIL → CUSTOMER ────────────────────────────────────────

export const sendRiderOnTheWayEmail = internalAction({
  args: {
    to: v.string(),
    customerName: v.string(),
    orderId: v.string(),
    riderName: v.string(),
    riderPhone: v.string(),
    riderPlate: v.optional(v.string()),
    otp: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message?: string; id?: string }> => {
    const shortId = args.orderId.slice(-8).toUpperCase();
    const trackUrl = `${SITE_URL}/track-order?order=${args.orderId}`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Your Rider is On the Way - DKMerch</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#42011e,#fc1268);padding:32px 36px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:white;">DKMerch</div>
        </td></tr>
        <tr><td style="background:#eff6ff;padding:20px 36px;text-align:center;border-bottom:1px solid #bfdbfe;">
          <div style="font-size:40px;margin-bottom:8px;">🛵</div>
          <div style="font-size:20px;font-weight:800;color:#1e40af;">Your Order is On Its Way!</div>
        </td></tr>
        <tr><td style="padding:28px 36px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px;">Hi <strong>${args.customerName}</strong>,</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;border:1.5px solid #86efac;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;text-align:center;">
              <div style="font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;margin-bottom:8px;">🔐 Your Delivery OTP</div>
              <div style="font-size:44px;font-weight:900;letter-spacing:12px;color:#15803d;margin:8px 0;">${args.otp}</div>
              <div style="font-size:13px;color:#166534;">Give this code to your rider when they arrive.</div>
            </td></tr>
          </table>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#fc1268,#9c27b0);color:white;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">📍 Track My Order</a>
          </div>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:20px 36px;text-align:center;">
          <div style="font-size:12px;color:#9ca3af;">© 2026 DKMerch · K-Pop Paradise · All rights reserved</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to: args.to,
      subject: `🛵 Your order #${shortId} is on its way! — DKMerch`,
      html,
    });
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// SMS via Semaphore (Philippines)
// Docs: https://semaphore.co/docs
//
// Setup:
//   1. Sign up at https://semaphore.co
//   2. Get your API key from the dashboard
//   3. Add to Convex env vars: SEMAPHORE_API_KEY=your_key_here
//   4. Optional: Add SEMAPHORE_SENDER_NAME=DKMerch (max 11 chars, needs approval)
//      — defaults to "DKMerch" if not set
//
// Only two SMS actions are exposed:
//   • sendSmsOtp        — registration / login OTP fallback
//   • sendRiderOtpSms   — delivery OTP sent when rider is on the way
// ══════════════════════════════════════════════════════════════════════════════

// ── BASE SMS (internal) ───────────────────────────────────────────────────────

export const sendSms = internalAction({
  args: {
    to: v.string(),   // PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX
    message: v.string(),
  },
  handler: async (
    _ctx,
    { to, message }: { to: string; message: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY;

    if (!SEMAPHORE_API_KEY) {
      console.error("SEMAPHORE_API_KEY not set.");
      return { success: false, message: "SMS service not configured." };
    }

    // Normalize to 639XXXXXXXXX format that Semaphore expects
    let number = to.replace(/[\s\-]/g, "");
    if (number.startsWith("09")) {
      number = "63" + number.slice(1);
    } else if (number.startsWith("+63")) {
      number = number.slice(1); // strip the +
    }
    // else assume already in 639XXXXXXXXX format

    const senderName = process.env.SEMAPHORE_SENDER_NAME || "DKMerch";

    const body = new URLSearchParams({
      apikey:      SEMAPHORE_API_KEY,
      number,
      message,
      sendername: senderName,
    });

    const response = await fetch("https://api.semaphore.co/api/v4/messages", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });

    const data = await response.json();

    if (!response.ok || (Array.isArray(data) && data[0]?.status === "Failed")) {
      console.error("Semaphore SMS error:", data);
      return { success: false, message: "Failed to send SMS." };
    }

    const msgId = Array.isArray(data) ? String(data[0]?.message_id ?? "") : "";
    console.log(`SMS sent to ${number} — ID: ${msgId}`);
    return { success: true, id: msgId };
  },
});

// ── REGISTRATION / LOGIN OTP SMS ──────────────────────────────────────────────
// Call this as a fallback when the customer has no data / email unreachable.
// Your frontend should call sendRegistrationOTP (email) first, then call this
// only if the user requests "Resend via SMS" or email delivery fails.

export const sendSmsOtp = action({
  args: {
    to:   v.string(), // PH mobile: 09XXXXXXXXX
    name: v.string(),
    otp:  v.string(),
  },
  handler: async (
    ctx,
    { to, name, otp }: { to: string; name: string; otp: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const message =
      `[DKMerch] Hi ${name}! Your verification code is: ${otp}. ` +
      `Valid for 3 minutes. Do NOT share this with anyone.`;

    return await ctx.runAction(internal.sendEmail.sendSms, { to, message });
  },
});

// ── DELIVERY OTP SMS → CUSTOMER (rider is on the way) ────────────────────────
// Triggered alongside sendRiderOnTheWayEmail so the customer gets the delivery
// OTP via SMS even if they have no internet / can't open email.

export const sendRiderOtpSms = internalAction({
  args: {
    to:      v.string(), // customer PH mobile: 09XXXXXXXXX
    name:    v.string(),
    orderId: v.string(),
    otp:     v.string(),
  },
  handler: async (
    ctx,
    { to, name, orderId, otp }: { to: string; name: string; orderId: string; otp: string }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const shortId = orderId.slice(-8).toUpperCase();
    const message =
      `[DKMerch] Hi ${name}! Your rider is on the way for Order #${shortId}. ` +
      `Delivery OTP: ${otp}. Give this code to your rider upon arrival. ` +
      `Do NOT share with anyone else.`;

    return await ctx.runAction(internal.sendEmail.sendSms, { to, message });
  },
});