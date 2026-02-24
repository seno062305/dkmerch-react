// convex/sendEmail.ts
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const SITE_URL = process.env.SITE_URL || "https://dkmerchwebsite.vercel.app";

// ── BASE EMAIL (internal) ─────────────────────────

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
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not set.");
      return { success: false, message: "Email service not configured." };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "DKMerch <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend error:", data);
      return { success: false, message: data.message || "Failed to send email." };
    }

    return { success: true, id: data.id };
  },
});

// ── PASSWORD RESET EMAIL ──────────────────────────

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
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #fc1268, #9c27b0); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🔐 Password Reset</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #333; font-size: 16px;">Hi ${name ?? "there"},</p>
          <p style="color: #555; font-size: 15px;">Your verification code to reset your password is:</p>
          <div style="background: #f8f9fa; border: 2px dashed #fc1268; border-radius: 10px; padding: 24px; text-align: center; margin: 24px 0;">
            <span style="font-size: 40px; font-weight: 700; letter-spacing: 8px; color: #fc1268;">${code}</span>
          </div>
          <p style="color: #888; font-size: 13px;">⏰ This code expires in 10 minutes.</p>
          <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
        <div style="background: #f8f9fa; padding: 16px; text-align: center;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise</p>
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

// ── ORDER CONFIRMATION EMAIL ──────────────────────

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
    promoCode:      v.optional(v.string()),
    promoName:      v.optional(v.string()),
    discountAmount: v.optional(v.number()),
    finalTotal:     v.optional(v.number()),
    shippingFee:    v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      to, name, orderId, items, total,
      promoCode, promoName, discountAmount, finalTotal, shippingFee,
    }: {
      to: string; name: string; orderId: string;
      items: { name: string; price: number; quantity: number }[];
      total: number;
      promoCode?: string; promoName?: string;
      discountAmount?: number; finalTotal?: number; shippingFee?: number;
    }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {

    const subtotalAmount = total - (shippingFee ?? 0);
    const chargedAmount  = finalTotal ?? total;
    const hasPromo       = !!(promoCode && discountAmount && discountAmount > 0);

    const itemRows = items.map((item) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; color: #333; font-size: 14px;">${item.name}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: center; color: #555; font-size: 14px;">${item.quantity}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-size: 14px;">₱${(item.price).toLocaleString()}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: right; color: #fc1268; font-weight: 600; font-size: 14px;">₱${(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join("");

    const promoRow = hasPromo ? `
      <tr style="background: #f0fdf4;">
        <td colspan="3" style="padding: 10px 12px; color: #15803d; font-size: 14px; font-weight: 600;">
          🎉 Promo Code: <span style="font-family: 'Courier New', monospace; background: #dcfce7; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px;">${promoCode}</span>
          ${promoName ? `<span style="color: #6b7280; font-size: 12px; margin-left: 6px;">(${promoName})</span>` : ''}
        </td>
        <td style="padding: 10px 12px; text-align: right; color: #16a34a; font-weight: 700; font-size: 14px;">−₱${discountAmount!.toLocaleString()}</td>
      </tr>
    ` : '';

    const shippingRow = `
      <tr>
        <td colspan="3" style="padding: 10px 12px; border-bottom: 1px solid #eee; color: #555; font-size: 14px;">Shipping Fee</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #eee; text-align: right; color: #333; font-size: 14px;">
          ${(shippingFee ?? 0) === 0 ? '<span style="color: #16a34a; font-weight: 600;">FREE</span>' : `₱${(shippingFee ?? 0).toLocaleString()}`}
        </td>
      </tr>
    `;

    const promoBanner = hasPromo ? `
      <div style="background: linear-gradient(135deg, #fdf2f8, #fce7f3); border: 1.5px solid #f9a8d4; border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px; font-weight: 700; color: #be185d;">🎁 You saved ₱${discountAmount!.toLocaleString()} with promo code ${promoCode}!</p>
        <p style="margin: 4px 0 0; font-size: 12px; color: #ec4899;">Thank you for being a DKMerch VIP! 💜</p>
      </div>
    ` : '';

    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 620px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #fc1268, #9c27b0); padding: 36px 32px; text-align: center;">
          <h1 style="color: white; margin: 0 0 6px; font-size: 28px;">🎉 Order Confirmed!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 15px;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #333; font-size: 16px; margin-top: 0;">Hi <strong>${name}</strong>! Thank you for your order 💜</p>
          <p style="color: #555; font-size: 14px;">Order ID: <strong style="font-family: monospace; font-size: 15px;">${orderId}</strong></p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #f0f0f0; border-radius: 10px; overflow: hidden;">
            <thead>
              <tr style="background: linear-gradient(135deg, #fc1268, #9c27b0);">
                <th style="padding: 12px; text-align: left; color: white; font-size: 13px;">Item</th>
                <th style="padding: 12px; text-align: center; color: white; font-size: 13px;">Qty</th>
                <th style="padding: 12px; text-align: right; color: white; font-size: 13px;">Unit Price</th>
                <th style="padding: 12px; text-align: right; color: white; font-size: 13px;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
              ${shippingRow}
              ${promoRow}
            </tbody>
          </table>
          <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #555; font-size: 14px;">Subtotal</td>
                <td style="padding: 6px 0; text-align: right; color: #333; font-size: 14px;">₱${subtotalAmount.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #555; font-size: 14px;">Shipping</td>
                <td style="padding: 6px 0; text-align: right; color: #333; font-size: 14px;">${(shippingFee ?? 0) === 0 ? '<span style="color: #16a34a; font-weight: 600;">FREE</span>' : `₱${(shippingFee ?? 0).toLocaleString()}`}</td>
              </tr>
              ${hasPromo ? `
              <tr>
                <td style="padding: 6px 0; color: #16a34a; font-size: 14px; font-weight: 600;">Promo Discount (${promoCode})</td>
                <td style="padding: 6px 0; text-align: right; color: #16a34a; font-size: 14px; font-weight: 700;">−₱${discountAmount!.toLocaleString()}</td>
              </tr>
              ` : ''}
              <tr style="border-top: 2px solid #e2e8f0;">
                <td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: #1a1a1a;">${hasPromo ? 'Total Charged' : 'Total'}</td>
                <td style="padding: 12px 0 6px; text-align: right; font-size: 22px; font-weight: 800; color: #fc1268;">₱${chargedAmount.toLocaleString()}</td>
              </tr>
            </table>
          </div>
          ${promoBanner}
          <p style="color: #555; font-size: 14px; line-height: 1.6;">We'll notify you once your order is shipped. 💜</p>
        </div>
        <div style="background: #f8f9fa; padding: 16px; text-align: center; border-top: 1px solid #e9ecef;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise</p>
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

// ── PROMO NOTIFICATION — blast to all registered users ──

export const sendPromoNotificationToAllUsers = internalAction({
  args: {
    promoCode:   v.string(),
    promoName:   v.string(),
    discount:    v.number(),
    maxDiscount: v.number(),
    startDate:   v.optional(v.string()),
    startTime:   v.optional(v.string()),
    endDate:     v.optional(v.string()),
    endTime:     v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; sent: number }> => {
    // ✅ FIXED: using internal.users (internalQuery) instead of api.users
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

    const scheduleRow = (startLabel || endLabel) ? `
      <tr>
        <td colspan="2" style="padding: 0 0 16px; text-align: center;">
          <span style="display: inline-block; background: rgba(147,51,234,0.1); border: 1px solid rgba(147,51,234,0.3); border-radius: 20px; padding: 6px 16px; font-size: 13px; color: #7c3aed;">
            📅 ${startLabel ? `<strong>Start:</strong> ${startLabel}` : ""}${startLabel && endLabel ? " &rarr; " : ""}${endLabel ? `<strong>End:</strong> ${endLabel}` : ""}
          </span>
        </td>
      </tr>
    ` : "";

    let sent = 0;
    for (const user of users) {
      if (!user.email) continue;

      const html = `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.12);">
          <div style="background: linear-gradient(135deg, #9333ea, #ec4899, #ef4444); padding: 40px 32px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">🔥</div>
            <h1 style="color: white; margin: 0 0 8px; font-size: 28px; font-weight: 900; letter-spacing: 1px;">LIMITED TIME PROMO!</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 16px;">Exclusive deal for DKMerch shoppers</p>
          </div>
          <div style="padding: 36px 32px; text-align: center;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">Hi <strong>${user.name}</strong>! 🎉 A new promo is live for <strong>${args.promoName}</strong> fans!</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              ${scheduleRow}
            </table>
            <div style="background: linear-gradient(135deg, #fdf2f8, #f5f3ff); border: 2px dashed #ec4899; border-radius: 16px; padding: 28px; margin: 0 0 28px;">
              <p style="color: #6b7280; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px;">Your Promo Code</p>
              <div style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: 900; color: #ec4899; letter-spacing: 4px; margin-bottom: 14px;">${args.promoCode}</div>
              <div style="background: linear-gradient(135deg, #9333ea, #ec4899); color: white; border-radius: 10px; padding: 12px 20px; display: inline-block; font-size: 18px; font-weight: 700;">
                ${args.discount}% OFF
                <span style="font-size: 13px; opacity: 0.85; margin-left: 6px;">(up to ₱${args.maxDiscount.toLocaleString()})</span>
              </div>
            </div>
            <a href="${SITE_URL}/promo/${args.promoCode}" style="display: inline-block; background: linear-gradient(135deg, #9333ea, #ec4899); color: white; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 16px; font-weight: 700; margin-bottom: 20px;">
              🛍️ Shop Now at DKMerch
            </a>
            <p style="color: #9ca3af; font-size: 13px; margin: 0;">Use code at checkout. Limited time only!</p>
          </div>
          <div style="background: #f8f9fa; padding: 16px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise · You're receiving this because you have a DKMerch account.</p>
          </div>
        </div>
      `;

      await ctx.runAction(internal.sendEmail.sendEmail, {
        to: user.email,
        subject: `🔥 ${args.promoCode} — ${args.discount}% OFF for ${args.promoName} fans! | DKMerch`,
        html,
      });
      sent++;
    }

    return { success: true, sent };
  },
});