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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3001;

// ─── Database ───────────────────────────────────────────────────────
const db = new TrackerDB();

// ─── Security Headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
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
  if (req.path.startsWith('/admin/api/') || req.path.match(/\.(js|css|png|jpg|svg|ico|woff|woff2|map)$/)) {
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
});

const roomManager = new RoomManager();
const socketHandler = new SocketHandler(io, roomManager, db);

// Restore any persisted rooms from a previous server session
const restored = socketHandler.loadPersistedRooms();
if (restored > 0) {
  console.log(`Restored ${restored} room(s) from disk`);
}

socketHandler.setup();

// ─── Routes ─────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const stats = db.getStats();
  res.json({ status: 'ok', activeConnections: stats.activeConnections, totalGames: stats.totalGames });
});

// Admin dashboard
app.use('/admin', createAdminRouter(db));

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
