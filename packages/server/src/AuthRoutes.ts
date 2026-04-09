import express, { type Request, type Response } from 'express';
import type { AuthService } from './AuthService.js';

const SESSION_COOKIE = 'cyprus_auth';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── IP-based rate limiter ──────────────────────────────────────────

const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_WINDOW_MS = 60_000; // 1 minute
const AUTH_RATE_MAX = 5; // 5 attempts per minute per IP

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

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}, 5 * 60_000).unref();

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

// ─── Router ─────────────────────────────────────────────────────────

export { SESSION_COOKIE, getAuthToken };

export function createAuthRouter(auth: AuthService, isProduction: boolean): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  // ── POST /auth/register ──────────────────────────────────────────
  router.post('/register', async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (isAuthRateLimited(ip)) {
      res.status(429).json({ error: 'Too many requests. Try again later' });
      return;
    }

    const { username, password, displayName } = req.body || {};
    const result = await auth.register(username, password, displayName);

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    // Auto-login after registration
    const loginResult = await auth.login(
      username, password,
      ip, req.headers['user-agent'] || null
    );

    if ('error' in loginResult) {
      // Registration succeeded but login failed (shouldn't happen)
      res.status(201).json(result);
      return;
    }

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
      res.status(401).json({ error: result.error });
      return;
    }

    setAuthCookie(res, result.token, isProduction);
    res.json({ user: result.user });
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

  // ── POST /auth/change-password ───────────────────────────────────
  router.post('/change-password', async (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = auth.validateSession(token);
    if (!session) {
      clearAuthCookie(res);
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const { currentPassword, newPassword } = req.body || {};
    const result = await auth.changePassword(session.userId, currentPassword, newPassword);

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    // Re-login with new session after password change
    clearAuthCookie(res);
    res.json({ success: true });
  });

  // ── POST /auth/delete-account ────────────────────────────────────
  router.post('/delete-account', async (req: Request, res: Response) => {
    const token = getAuthToken(req);
    if (!token) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = auth.validateSession(token);
    if (!session) {
      clearAuthCookie(res);
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const { password } = req.body || {};
    const result = await auth.deleteAccount(session.userId, password);

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    clearAuthCookie(res);
    res.json({ success: true });
  });

  return router;
}
