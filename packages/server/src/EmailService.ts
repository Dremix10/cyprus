import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@tichu.game';
const APP_URL = process.env.APP_URL || 'http://165.245.175.45';

let transporter: nodemailer.Transporter | null = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log(`Email service configured (${SMTP_HOST}:${SMTP_PORT})`);
} else {
  console.log('Email service not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS to enable');
}

export function isEmailConfigured(): boolean {
  return transporter !== null;
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<boolean> {
  if (!transporter) {
    console.log(`[EMAIL] Would send reset email to ${to} (SMTP not configured)`);
    console.log(`[EMAIL] Reset link: ${APP_URL}?resetToken=${resetToken}`);
    return false;
  }

  const resetUrl = `${APP_URL}?resetToken=${resetToken}`;

  try {
    await transporter.sendMail({
      from: `"Tichu" <${SMTP_FROM}>`,
      to,
      subject: 'Reset your Tichu password',
      text: `You requested a password reset for your Tichu account.\n\nClick this link to set a new password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem; background: #1a1a2e; color: #e0e0e0; border-radius: 12px;">
          <h2 style="color: #c9a84c; margin-bottom: 0.5rem;">Tichu</h2>
          <p>You requested a password reset for your Tichu account.</p>
          <p>Click the button below to set a new password. This link is valid for <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #c9a84c; color: #000; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 1rem 0;">Reset Password</a>
          <p style="color: #888; font-size: 0.85rem; margin-top: 1.5rem;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send reset email:', err);
    return false;
  }
}
