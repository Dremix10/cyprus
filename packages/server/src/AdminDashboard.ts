import express, { type Request, type Response, type NextFunction } from 'express';
import { createHash, timingSafeEqual, randomBytes, scrypt } from 'node:crypto';
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

  router.get('/api/audit', requireAuth, (_req, res) => {
    const now = new Date().toISOString();
    const stats = db.getStats();

    // Stuck games (running > 2 hours)
    const stuckGames = db.runReadOnlyQuery(
      `SELECT id, room_code, started_at FROM games WHERE ended_at IS NULL AND started_at < datetime('now', '-2 hours')`,
      50
    );

    // Errors in last 2 hours
    const recentErrors = db.getServerLogs({ level: 'error', limit: 50 });
    const errorsLast2h = recentErrors.filter((l: any) => {
      const logTime = new Date(l.created_at + 'Z').getTime();
      return Date.now() - logTime < 2 * 60 * 60_000;
    });

    // Bot errors
    const botErrors = db.getServerLogs({ category: 'bot', limit: 20 });
    const botErrorsLast2h = botErrors.filter((l: any) => {
      const logTime = new Date(l.created_at + 'Z').getTime();
      return Date.now() - logTime < 2 * 60 * 60_000;
    });

    // Disconnects in last 2 hours
    const disconnects = db.getServerLogs({ category: 'connection', level: 'warn', limit: 50 });
    const disconnectsLast2h = disconnects.filter((l: any) => {
      const logTime = new Date(l.created_at + 'Z').getTime();
      return Date.now() - logTime < 2 * 60 * 60_000;
    });

    // Determine status
    let status = 'OK';
    const issues: string[] = [];

    if (stuckGames.rowCount > 0) {
      status = 'WARNING';
      issues.push(`${stuckGames.rowCount} stuck game(s) running >2 hours`);
    }
    if (errorsLast2h.length > 5) {
      status = 'WARNING';
      issues.push(`${errorsLast2h.length} errors in last 2 hours`);
    }
    if (errorsLast2h.length > 20) {
      status = 'CRITICAL';
    }
    if (botErrorsLast2h.length > 3) {
      status = 'WARNING';
      issues.push(`${botErrorsLast2h.length} bot errors in last 2 hours`);
    }

    res.json({
      timestamp: now,
      status,
      health: {
        activeConnections: stats.activeConnections,
        totalGames: stats.totalGames,
        gamesInProgress: stats.gamesInProgress,
        totalPlayers: stats.totalPlayers,
      },
      issues: issues.length > 0 ? issues : ['None'],
      metrics: {
        errorsLast2h: errorsLast2h.length,
        botErrorsLast2h: botErrorsLast2h.length,
        disconnectsLast2h: disconnectsLast2h.length,
        stuckGames: stuckGames.rowCount,
      },
      recentErrors: errorsLast2h.slice(0, 5),
      stuckGameDetails: stuckGames.rows,
    });
  });

  router.get('/api/logs', requireAuth, (req, res) => {
    const level = req.query.level as string | undefined;
    const category = req.query.category as string | undefined;
    const roomCode = req.query.room as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(db.getServerLogs({ level, category, roomCode, limit }));
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

  // ─── Admin Password Reset ────────────────────────────────────────

  router.post('/api/reset-user-password', requireAuth, async (req, res) => {
    const identifier = (req.body?.identifier as string)?.trim();
    const newPassword = req.body?.newPassword as string;

    if (!identifier) {
      res.status(400).json({ error: 'Username or email is required' });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (newPassword.length > 128) {
      res.status(400).json({ error: 'Password must be at most 128 characters' });
      return;
    }

    // Look up user by username first, then email
    let user = db.getUserByUsername(identifier);
    if (!user && identifier.includes('@')) {
      user = db.getUserByEmail(identifier.toLowerCase());
    }

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    try {
      // Hash password using scrypt (same format as AuthService)
      const salt = randomBytes(32);
      const hash = await new Promise<Buffer>((resolve, reject) => {
        scrypt(newPassword, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
          if (err) reject(err); else resolve(derivedKey);
        });
      });
      const passwordHash = `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;

      db.updateUserPassword(user.id, passwordHash);
      res.json({ success: true, username: user.username });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to hash password';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
