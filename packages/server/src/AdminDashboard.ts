import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TrackerDB } from './Database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOGIN_HTML = readFileSync(join(__dirname, 'admin', 'login.html'), 'utf-8');
const DASHBOARD_HTML = readFileSync(join(__dirname, 'admin', 'dashboard.html'), 'utf-8');

// SHA-256 hash of default password — override with ADMIN_PASSWORD env var
const DEFAULT_HASH = '11b6968ce0b6e99c8952c32e0b65320e7b4c6119aebd56cc361158e20333636f';

function getExpectedHash(): string {
  if (process.env.ADMIN_PASSWORD) {
    return createHash('sha256').update(process.env.ADMIN_PASSWORD).digest('hex');
  }
  return DEFAULT_HASH;
}

function verifyPassword(input: string): boolean {
  const inputHash = createHash('sha256').update(input).digest('hex');
  const expected = getExpectedHash();
  try {
    return timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const [key, ...vals] = pair.trim().split('=');
    if (key) cookies[key] = vals.join('=');
  }
  return cookies;
}

export function createAdminRouter(db: TrackerDB): express.Router {
  const router = express.Router();

  // Parse form bodies for login
  router.use(express.urlencoded({ extended: false }));

  function verifyApiKey(req: Request): boolean {
    const apiKey = process.env.DATA_API_KEY;
    if (!apiKey) return false;
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return false;
    const provided = auth.slice(7);
    try {
      return timingSafeEqual(Buffer.from(provided), Buffer.from(apiKey));
    } catch {
      return false;
    }
  }

  function requireAuth(req: Request, res: Response, next: NextFunction): void {
    // API key auth (for programmatic access)
    if (verifyApiKey(req)) { next(); return; }
    // Session auth (for browser access)
    const token = parseCookies(req)['admin_token'];
    if (token && db.validateAdminSession(token)) {
      next();
    } else {
      // API requests get 401, browser requests get redirect
      if (req.headers.authorization || req.headers.accept?.includes('application/json')) {
        res.status(401).json({ error: 'Unauthorized' });
      } else {
        res.redirect('/admin/login');
      }
    }
  }

  // ─── Login ────────────────────────────────────────────────────────

  router.get('/login', (_req, res) => {
    res.type('html').send(LOGIN_HTML);
  });

  router.post('/login', (req, res) => {
    const password = (req.body?.password as string) || '';

    if (verifyPassword(password)) {
      const token = randomBytes(32).toString('hex');
      db.createAdminSession(token);
      res.setHeader('Set-Cookie', `admin_token=${token}; HttpOnly; Path=/admin; SameSite=Lax; Max-Age=86400`);
      res.redirect('/admin');
    } else {
      res.type('html').send(LOGIN_HTML.replace('<!--ERROR-->', '<p class="error">Invalid password</p>'));
    }
  });

  router.get('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'admin_token=; HttpOnly; Path=/admin; Max-Age=0');
    res.redirect('/admin/login');
  });

  // ─── Dashboard ──────────────────────────────────────────────────

  router.get('/', requireAuth, (_req, res) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  // ─── API Endpoints ──────────────────────────────────────────────

  router.get('/api/stats', requireAuth, (_req, res) => {
    res.json(db.getStats());
  });

  router.get('/api/connections', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    res.json(db.getRecentConnections(limit));
  });

  router.get('/api/players', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(db.getPlayers(limit));
  });

  router.get('/api/games', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    res.json(db.getRecentGames(limit));
  });

  router.get('/api/events', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(db.getRecentEvents(limit));
  });

  router.get('/api/requests', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(db.getRecentHttpRequests(limit));
  });

  router.get('/api/traffic', requireAuth, (req, res) => {
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    res.json(db.getHourlyTraffic(hours));
  });

  router.get('/api/top-ips', requireAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(db.getTopIPs(limit));
  });

  router.get('/api/tables', requireAuth, (_req, res) => {
    res.json(db.getTableInfo());
  });

  router.use(express.json());

  router.post('/api/query', requireAuth, (req, res) => {
    const sql = (req.body?.sql as string) || '';
    const limit = Math.min(Number(req.body?.limit) || 200, 1000);
    if (!sql.trim()) {
      res.status(400).json({ error: 'No query provided' });
      return;
    }
    try {
      const result = db.runReadOnlyQuery(sql, limit);
      res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Query failed';
      res.status(400).json({ error: message });
    }
  });

  return router;
}
