const RESEND_API_KEY = process.env.SMTP_PASS; // Resend API key stored in SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@tichu.game';
const APP_URL = process.env.APP_URL || 'http://165.245.175.45';

if (RESEND_API_KEY) {
  console.log('Email service configured (Resend HTTP API)');
} else {
  console.log('Email service not configured — set SMTP_PASS to Resend API key to enable');
}

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[EMAIL] Would send reset email to ${to} (not configured)`);
    console.log(`[EMAIL] Reset link: ${APP_URL}?resetToken=${resetToken}`);
    return false;
  }

  const resetUrl = `${APP_URL}?resetToken=${resetToken}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Tichu <${SMTP_FROM}>`,
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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[EMAIL] Resend API error (${res.status}):`, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[EMAIL] Failed to send reset email:', err);
    return false;
  }
}
