import express, { type Request, type Response, type NextFunction } from 'express';
import type { TrackerDB } from './Database.js';
import type { AuthService } from './AuthService.js';
import { SESSION_COOKIE } from './AuthRoutes.js';
import { isUserOnline } from './SocketHandler.js';

interface AuthRequest extends Request {
  userId?: number;
}

function requireAuth(authService: AuthService) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
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
    req.userId = session.userId;
    next();
  };
}

/** Validate that a value is a positive integer (not float, NaN, Infinity, or negative) */
function isValidId(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
}

// ─── Per-user rate limiting for friend API ──────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

class FriendRateLimiter {
  private buckets = new Map<string, RateBucket>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /** Returns true if the action is allowed */
  isAllowed(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count++;
    return bucket.count <= limit;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}

export function createFriendRouter(db: TrackerDB, authService: AuthService): express.Router {
  const router = express.Router();
  const rateLimiter = new FriendRateLimiter();

  router.use(express.json({ limit: '16kb' }));
  router.use(requireAuth(authService) as express.RequestHandler);

  // GET /friends — list friends with online status
  router.get('/', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`list:${req.userId}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const friends = db.getFriends(req.userId!);
    const withOnline = friends.map((f) => ({ ...f, online: isUserOnline(f.id) }));
    res.json(withOnline);
  });

  // GET /friends/requests — pending incoming requests
  router.get('/requests', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`list:${req.userId}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const requests = db.getPendingRequests(req.userId!);
    res.json(requests);
  });

  // POST /friends/request — send friend request
  router.post('/request', (req: AuthRequest, res: Response) => {
    // Rate limit: 10 friend requests per minute
    if (!rateLimiter.isAllowed(`request:${req.userId}`, 10, 60_000)) {
      res.status(429).json({ error: 'Too many friend requests, slow down' }); return;
    }
    const { friendId } = req.body;
    if (!isValidId(friendId)) {
      res.status(400).json({ error: 'Invalid friendId' });
      return;
    }
    // Prevent sending request to yourself
    if (friendId === req.userId) {
      res.status(400).json({ error: 'Cannot add yourself' });
      return;
    }
    // Verify target user exists
    if (!db.getUserById(friendId)) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const result = db.sendFriendRequest(req.userId!, friendId);
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true });
  });

  // POST /friends/accept — accept a friend request
  router.post('/accept', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`action:${req.userId}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const { userId } = req.body;
    if (!isValidId(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const ok = db.acceptFriendRequest(req.userId!, userId);
    if (!ok) { res.status(400).json({ error: 'No pending request found' }); return; }
    res.json({ success: true });
  });

  // POST /friends/reject — reject a friend request
  router.post('/reject', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`action:${req.userId}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const { userId } = req.body;
    if (!isValidId(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const ok = db.rejectFriendRequest(req.userId!, userId);
    if (!ok) { res.status(400).json({ error: 'No pending request found' }); return; }
    res.json({ success: true });
  });

  // POST /friends/remove — remove a friend
  router.post('/remove', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`action:${req.userId}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const { friendId } = req.body;
    if (!isValidId(friendId)) {
      res.status(400).json({ error: 'Invalid friendId' });
      return;
    }
    const ok = db.removeFriend(req.userId!, friendId);
    if (!ok) { res.status(400).json({ error: 'Not friends' }); return; }
    res.json({ success: true });
  });

  // GET /friends/search?q=query — search users to add
  router.get('/search', (req: AuthRequest, res: Response) => {
    // Rate limit: 20 searches per minute
    if (!rateLimiter.isAllowed(`search:${req.userId}`, 20, 60_000)) {
      res.status(429).json({ error: 'Too many searches, slow down' }); return;
    }
    const q = String(req.query.q || '').trim();
    if (q.length < 2) { res.json([]); return; }
    // Cap search query length to prevent abuse
    const truncated = q.slice(0, 50);
    const results = db.searchUsers(truncated, req.userId!);
    // Include friendship status for each result
    const withStatus = results.map((u) => ({
      ...u,
      friendStatus: db.getFriendshipStatus(req.userId!, u.id),
    }));
    res.json(withStatus);
  });

  // GET /friends/status/:userId — check friendship status with a user
  router.get('/status/:userId', (req: AuthRequest, res: Response) => {
    if (!rateLimiter.isAllowed(`status:${req.userId}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many requests, slow down' }); return;
    }
    const otherId = parseInt(req.params.userId, 10);
    if (!isValidId(otherId)) { res.status(400).json({ error: 'Invalid userId' }); return; }
    const status = db.getFriendshipStatus(req.userId!, otherId);
    res.json({ status });
  });

  return router;
}
