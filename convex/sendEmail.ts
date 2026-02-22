// convex/sendEmail.ts
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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
  },
  handler: async (
    ctx,
    {
      to,
      name,
      orderId,
      items,
      total,
    }: {
      to: string;
      name: string;
      orderId: string;
      items: { name: string; price: number; quantity: number }[];
      total: number;
    }
  ): Promise<{ success: boolean; message?: string; id?: string }> => {
    const itemRows = items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee; color: #333;">${item.name}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; color: #555;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; color: #fc1268; font-weight: 600;">₱${(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `
      )
      .join("");

    const html = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #fc1268, #9c27b0); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Order Confirmed!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">DKMerch K-Pop Paradise</p>
        </div>
        <div style="padding: 32px;">
          <p style="color: #333; font-size: 16px;">Hi <strong>${name}</strong>! Thank you for your order 💜</p>
          <p style="color: #555;">Order ID: <strong>${orderId}</strong></p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 10px; text-align: left; color: #555; font-size: 13px;">Item</th>
                <th style="padding: 10px; text-align: center; color: #555; font-size: 13px;">Qty</th>
                <th style="padding: 10px; text-align: right; color: #555; font-size: 13px;">Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="text-align: right; border-top: 2px solid #fc1268; padding-top: 12px;">
            <strong style="font-size: 18px; color: #fc1268;">Total: ₱${total.toLocaleString()}</strong>
          </div>
          <p style="color: #555; margin-top: 24px; font-size: 14px;">We'll notify you once your order is shipped. You can track your order on our website.</p>
        </div>
        <div style="background: #f8f9fa; padding: 16px; text-align: center;">
          <p style="color: #aaa; font-size: 12px; margin: 0;">© 2026 DKMerch · K-Pop Paradise</p>
        </div>
      </div>
    `;

    return await ctx.runAction(internal.sendEmail.sendEmail, {
      to,
      subject: `Order Confirmed — ${orderId} | DKMerch`,
      html,
    });
  },
});