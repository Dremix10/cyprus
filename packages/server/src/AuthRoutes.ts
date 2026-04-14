import express, { type Request, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import type { AuthService } from './AuthService.js';
import { sendPasswordResetEmail, isEmailConfigured } from './EmailService.js';
import type { GameMonitor } from './GameMonitor.js';

const SESSION_COOKIE = 'cyprus_auth';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── IP-based rate limiter ──────────────────────────────────────────

const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_MAX = 5;

function isAuthRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > AUTH_RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}, 5 * 60_000).unref();

// ─── Forgot-password rate limiter (10 per 15 min per IP) ────────────

const resetAttempts = new Map<string, { count: number; resetAt: number }>();

function isResetRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = resetAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    resetAttempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

// ─── Cookie helpers ─────────────────────────────────────────────────

function setAuthCookie(res: Response, token: string, isProduction: boolean): void {
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'Path=/',
    `SameSite=${isProduction ? 'Strict' : 'Lax'}`,
    `Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}`,
    ...(isProduction ? ['Secure'] : []),
  ].join('; '));
}

function clearAuthCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
}

function getAuthToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const pair of header.split(';')) {
    const [key, ...vals] = pair.trim().split('=');
    if (key === SESSION_COOKIE) return vals.join('=') || null;
  }
  return null;
}

// ─── Google OAuth Client ────────────────────────────────────────────

let googleClient: OAuth2Client | null = null;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (GOOGLE_CLIENT_ID) {
  googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  console.log('Google Sign-In configured');
} else {
  console.log('Google Sign-In not configured — set GOOGLE_CLIENT_ID to enable');
}

// ─── Router ─────────────────────────────────────────────────────────

export { SESSION_COOKIE, getAuthToken };

export function createAuthRouter(auth: AuthService, isProduction: boolean, monitor?: GameMonitor): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  // ── POST /auth/register ──────────────────────────────────────────
  router.post('/register', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ip)) {
      res.status(429).json({ error: 'Too many requests. Try again later' });
      return;
    }

    const { username, password, displayName, email } = req.body || {};
    const result = await auth.register(username, password, displayName, email);

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    monitor?.accountCreated(result.user.id, username);

    // Auto-login after registration
    const loginResult = await auth.login(
      username, password,
      ip, req.headers['user-agent'] || null
    );

    if ('error' in loginResult) {
      res.status(201).json(result);
      return;
    }

    monitor?.loginSuccess(loginResult.user.id, loginResult.user.username, ip);
    setAuthCookie(res, loginResult.token, isProduction);
    res.status(201).json({ user: loginResult.user });
  });

  // ── POST /auth/login ─────────────────────────────────────────────
  router.post('/login', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ip)) {
      res.status(429).json({ error: 'Too many requests. Try again later' });
      return;
    }

    const { username, password } = req.body || {};
    const result = await auth.login(
      username, password,
      ip, req.headers['user-agent'] || null
    );

    if ('error' in result) {
      monitor?.loginFailed(username ?? '', ip, result.error);
      res.status(401).json({ error: result.error });
      return;
    }

    monitor?.loginSuccess(result.user.id, result.user.username, ip);
    setAuthCookie(res, result.token, isProduction);
    res.json({ user: result.user });
  });

  // ── POST /auth/google ────────────────────────────────────────────
  router.post('/google', async (req: Request, res: Response) => {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      res.status(501).json({ error: 'Google Sign-In is not configured' });
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ip)) {
      res.status(429).json({ error: 'Too many requests. Try again later' });
      return;
    }

    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      res.status(400).json({ error: 'Missing Google credential' });
      return;
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        res.status(400).json({ error: 'Invalid Google token' });
        return;
      }

      const result = await auth.loginWithGoogle(
        payload.sub,
        payload.email,
        payload.name || payload.email.split('@')[0],
        ip,
        req.headers['user-agent'] || null
      );

      monitor?.loginSuccess(result.user.id, result.user.username, ip);
      setAuthCookie(res, result.token, isProduction);
      res.json({ user: result.user });
    } catch (err) {
      console.error('Google auth error:', err);
      monitor?.loginFailed('google-oauth', ip, (err as Error).message);
      res.status(401).json({ error: 'Google authentication failed' });
    }
  });

  // ── POST /auth/forgot-password ───────────────────────────────────
  router.post('/forgot-password', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isResetRateLimited(ip)) {
      res.status(429).json({ error: 'Too many requests. Try again later' });
      return;
    }

    const { email } = req.body || {};
    const result = auth.forgotPassword(email);

    // Always return success to prevent email enumeration
    if ('error' in result) {
      if (result.error !== '__silent__') {
        res.status(400).json({ error: result.error });
        return;
      }
      // Silent: email doesn't exist, but don't reveal that
      res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent' });
      return;
    }

    // Send the email
    const emailSent = await sendPasswordResetEmail(email.trim().toLowerCase(), result.token);
    if (!emailSent && isEmailConfigured()) {
      console.error(`Failed to send reset email to ${email}`);
    }

    res.json({ success: true, message: 'If an account with that email exists, a reset link has been sent' });
  });

  // ── POST /auth/reset-password ────────────────────────────────────
  router.post('/reset-password', async (req: Request, res: Response) => {
    const { token, newPassword } = req.body || {};
    const result = await auth.resetPassword(token, newPassword);

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    res.json({ success: true });
  });

  // ── POST /auth/logout ────────────────────────────────────────────
  router.post('/logout', (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (token) auth.logout(token);
    clearAuthCookie(res);
    res.json({ success: true });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────
  router.get('/me', (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = auth.getUser(token);
    if (!user) {
      clearAuthCookie(res);
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    res.json({ user });
  });

  // ── GET /auth/google-client-id ───────────────────────────────────
  // Public endpoint — client needs the ID to render the Google button
  router.get('/google-client-id', (_req: Request, res: Response) => {
    res.json({ clientId: GOOGLE_CLIENT_ID || null });
  });

  // ── POST /auth/change-password ───────────────────────────────────
  router.post('/change-password', async (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const session = auth.validateSession(token);
    if (!session) { clearAuthCookie(res); res.status(401).json({ error: 'Session expired' }); return; }

    const { currentPassword, newPassword } = req.body || {};
    const result = await auth.changePassword(session.userId, currentPassword, newPassword);
    if ('error' in result) { res.status(400).json(result); return; }

    clearAuthCookie(res);
    res.json({ success: true });
  });

  // ── POST /auth/delete-account ────────────────────────────────────
  router.post('/delete-account', async (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const session = auth.validateSession(token);
    if (!session) { clearAuthCookie(res); res.status(401).json({ error: 'Session expired' }); return; }

    const { password } = req.body || {};
    const result = await auth.deleteAccount(session.userId, password);
    if ('error' in result) { res.status(400).json(result); return; }

    clearAuthCookie(res);
    res.json({ success: true });
  });

  return router;
}
