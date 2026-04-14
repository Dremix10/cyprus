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

export function createFriendRouter(db: TrackerDB, authService: AuthService): express.Router {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));
  router.use(requireAuth(authService) as express.RequestHandler);

  // GET /friends — list friends with online status
  router.get('/', (req: AuthRequest, res: Response) => {
    const friends = db.getFriends(req.userId!);
    const withOnline = friends.map((f) => ({ ...f, online: isUserOnline(f.id) }));
    res.json(withOnline);
  });

  // GET /friends/requests — pending incoming requests
  router.get('/requests', (req: AuthRequest, res: Response) => {
    const requests = db.getPendingRequests(req.userId!);
    res.json(requests);
  });

  // POST /friends/request — send friend request
  router.post('/request', (req: AuthRequest, res: Response) => {
    const { friendId } = req.body;
    if (!friendId || typeof friendId !== 'number') {
      res.status(400).json({ error: 'Missing friendId' });
      return;
    }
    const result = db.sendFriendRequest(req.userId!, friendId);
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true });
  });

  // POST /friends/accept — accept a friend request
  router.post('/accept', (req: AuthRequest, res: Response) => {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'number') {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }
    const ok = db.acceptFriendRequest(req.userId!, userId);
    if (!ok) { res.status(400).json({ error: 'No pending request found' }); return; }
    res.json({ success: true });
  });

  // POST /friends/reject — reject a friend request
  router.post('/reject', (req: AuthRequest, res: Response) => {
    const { userId } = req.body;
    if (!userId || typeof userId !== 'number') {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }
    const ok = db.rejectFriendRequest(req.userId!, userId);
    if (!ok) { res.status(400).json({ error: 'No pending request found' }); return; }
    res.json({ success: true });
  });

  // POST /friends/remove — remove a friend
  router.post('/remove', (req: AuthRequest, res: Response) => {
    const { friendId } = req.body;
    if (!friendId || typeof friendId !== 'number') {
      res.status(400).json({ error: 'Missing friendId' });
      return;
    }
    const ok = db.removeFriend(req.userId!, friendId);
    if (!ok) { res.status(400).json({ error: 'Not friends' }); return; }
    res.json({ success: true });
  });

  // GET /friends/search?q=query — search users to add
  router.get('/search', (req: AuthRequest, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) { res.json([]); return; }
    const results = db.searchUsers(q, req.userId!);
    // Include friendship status for each result
    const withStatus = results.map((u) => ({
      ...u,
      friendStatus: db.getFriendshipStatus(req.userId!, u.id),
    }));
    res.json(withStatus);
  });

  // GET /friends/status/:userId — check friendship status with a user
  router.get('/status/:userId', (req: AuthRequest, res: Response) => {
    const otherId = parseInt(req.params.userId, 10);
    if (isNaN(otherId)) { res.status(400).json({ error: 'Invalid userId' }); return; }
    const status = db.getFriendshipStatus(req.userId!, otherId);
    res.json({ status });
  });

  return router;
}
