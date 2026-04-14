import { timingSafeEqual } from 'crypto';
import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import { Server } from 'socket.io';
import helmet from 'helmet';
import type { ClientToServerEvents, ServerToClientEvents } from '@cyprus/shared';
import { RoomManager } from './RoomManager.js';
import { SocketHandler } from './SocketHandler.js';
import { TrackerDB } from './Database.js';
import { createAdminRouter } from './AdminDashboard.js';
import { AuthService } from './AuthService.js';
import { createAuthRouter, SESSION_COOKIE } from './AuthRoutes.js';
import { createFriendRouter } from './FriendRoutes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3001;

// ─── Database & Auth ────────────────────────────────────────────────
const db = new TrackerDB();
const authService = new AuthService(db);

// Clean expired sessions every hour
const sessionCleanupInterval = setInterval(() => {
  authService.cleanExpiredSessions();
  db.cleanExpiredSessions();
}, 60 * 60_000);
sessionCleanupInterval.unref();

// ─── Security Headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com"],
      connectSrc: ["'self'", "ws:", "wss:", "https://accounts.google.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["https://accounts.google.com"],
      upgradeInsecureRequests: null,
      scriptSrcAttr: ["'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: false,
}));

// Trust proxy for X-Forwarded-For headers (behind nginx)
app.set('trust proxy', 1);

// ─── HTTP Request Logging ───────────────────────────────────────────
app.use((req, res, next) => {
  // Skip admin API and static asset logging to reduce noise
  if (req.path.startsWith('/admin/api/') || req.path.startsWith('/auth/') || req.path.match(/\.(js|css|png|jpg|svg|ico|woff|woff2|map)$/)) {
    next();
    return;
  }
  const start = Date.now();
  res.on('finish', () => {
    try {
      db.logHttpRequest(
        req.method,
        req.path,
        req.ip || req.socket.remoteAddress || null,
        req.headers['user-agent'] || null,
        res.statusCode,
        Date.now() - start
      );
    } catch { /* don't crash on logging failure */ }
  });
  next();
});

// ─── Socket.IO ──────────────────────────────────────────────────────
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: isProduction
    ? undefined
    : { origin: process.env.CLIENT_URL ?? 'http://localhost:5173', credentials: true },
  pingTimeout: 30000,   // wait 30s for pong before considering disconnected (default 20s)
  pingInterval: 25000,  // send ping every 25s (default 25s)
});

// ─── Socket.IO Auth Middleware ──────────────────────────────────────
// Extract user identity from auth cookie on handshake (optional — guests allowed)
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [key, ...vals] = pair.trim().split('=');
      if (key === SESSION_COOKIE) {
        const token = vals.join('=');
        const session = authService.validateSession(token);
        if (session) {
          const user = db.getUserById(session.userId);
          if (user) {
            socket.data.userId = user.id;
            socket.data.displayName = user.display_name;
          }
        }
        break;
      }
    }
  }
  next(); // Always allow connection — guests play without auth
});

const roomManager = new RoomManager();
const socketHandler = new SocketHandler(io, roomManager, db);

// Restore any persisted rooms from a previous server session
const restored = socketHandler.loadPersistedRooms();
if (restored > 0) {
  console.log(`Restored ${restored} room(s) from disk`);
}

socketHandler.setup();

// ─── Build Info ─────────────────────────────────────────────────────
import { execSync } from 'node:child_process';

let commitHash = 'unknown';
let commitMessage = '';
let commitDate = '';
try {
  commitHash = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  commitMessage = execSync('git log -1 --pretty=%s', { cwd: __dirname }).toString().trim();
  commitDate = execSync('git log -1 --pretty=%ci', { cwd: __dirname }).toString().trim();
} catch { /* not in a git repo */ }
const startedAt = new Date().toISOString();

// ─── Routes ─────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const stats = db.getStats();
  res.json({
    status: 'ok',
    commit: commitHash,
    commitMessage,
    commitDate,
    startedAt,
    activeConnections: stats.activeConnections,
    totalGames: stats.totalGames,
  });
});

// Public leaderboard API
app.get('/api/leaderboard', (_req, res) => {
  const limit = Math.min(Number(_req.query.limit) || 50, 100);
  const leaderboard = db.getLeaderboard(limit);
  res.json(leaderboard);
});

app.get('/api/leaderboard/me', (req, res) => {
  // Parse auth session cookie manually (no cookie-parser middleware)
  let token: string | undefined;
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [key, val] = pair.trim().split('=');
      if (key === SESSION_COOKIE) { token = val; break; }
    }
  }
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const session = authService.validateSession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid session' });
    return;
  }
  const stats = db.getUserLeaderboardStats(session.userId);
  const user = db.getUserById(session.userId);
  if (!stats || !user) {
    res.status(404).json({ error: 'No stats found' });
    return;
  }
  res.json({ ...stats, username: user.username, display_name: user.display_name });
});

app.get('/api/leaderboard/history', (req, res) => {
  let token: string | undefined;
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const pair of cookieHeader.split(';')) {
      const [key, val] = pair.trim().split('=');
      if (key === SESSION_COOKIE) { token = val; break; }
    }
  }
  if (!token) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const session = authService.validateSession(token);
  if (!session) { res.status(401).json({ error: 'Invalid session' }); return; }

  const history = db.getUserGameHistory(session.userId, 5);
  const results = history.map((g) => {
    const myTeam = g.player_position % 2 === 0 ? 'Team 0-2' : 'Team 1-3';
    const isTeam02 = g.player_position % 2 === 0;
    return {
      game_id: g.game_id,
      ended_at: g.ended_at,
      won: g.winner_team === myTeam,
      myScore: isTeam02 ? g.final_score_02 : g.final_score_13,
      opponentScore: isTeam02 ? g.final_score_13 : g.final_score_02,
      botDifficulty: g.bot_difficulty,
    };
  });
  res.json(results);
});

// Auth routes
app.use('/auth', createAuthRouter(authService, isProduction));
app.use('/api/friends', createFriendRouter(db, authService));

// Admin dashboard
app.use('/admin', createAdminRouter(db));

// Shutdown endpoint for deploy scripts (same auth as admin API)
app.post('/admin/api/shutdown', (req, res) => {
  const apiKey = process.env.DATA_API_KEY;
  const auth = req.headers.authorization;
  if (!apiKey || !auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    if (!timingSafeEqual(Buffer.from(auth.slice(7)), Buffer.from(apiKey))) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ status: 'shutting down' });
  setTimeout(() => shutdown('DEPLOY'), 500);
});

// Serve the client build (always — not just production)
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down gracefully...`);
  socketHandler.destroy();
  roomManager.destroy();
  httpServer.close(() => {
    db.close();
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10 seconds
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent crashes from unhandled errors — log and keep running
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server staying alive):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server staying alive):', reason);
});
