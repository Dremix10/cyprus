import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import type { TrackerDB } from './Database.js';
import type { AuthUser } from '@cyprus/shared';

function scryptAsync(
  password: string | Buffer, salt: Buffer, keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err); else resolve(derivedKey);
    });
  });
}

// ─── Scrypt Parameters ─────────────────────────────────────────────
// N=16384, r=8, p=1 — OWASP recommended minimum for scrypt
// 32-byte salt, 64-byte derived key
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

// ─── Policy Constants ───────────────────────────────────────────────
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_EXPIRY_HOURS = 168; // 7 days
const MAX_SESSIONS_PER_USER = 10;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;
const DISPLAY_NAME_MAX_LENGTH = 20;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
const DISPLAY_NAME_REGEX = /^[\w\s\-\u00C0-\u024F]+$/;

// ─── Password Hashing ──────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  }) as Buffer;
  // Format: scrypt$N$r$p$salt_hex$hash_hex
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], 'hex');
  const expectedHash = Buffer.from(parts[5], 'hex');

  const derived = await scryptAsync(password, salt, expectedHash.length, { N, r, p }) as Buffer;

  // Timing-safe comparison prevents timing attacks
  try {
    return timingSafeEqual(derived, expectedHash);
  } catch {
    return false;
  }
}

// ─── Input Validation ──────────────────────────────────────────────

function validateUsername(username: string): string | null {
  if (!username || typeof username !== 'string') return 'Username is required';
  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  if (trimmed.length > USERNAME_MAX_LENGTH) return `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
  if (!USERNAME_REGEX.test(trimmed)) return 'Username can only contain letters, numbers, and underscores';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password || typeof password !== 'string') return 'Password is required';
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  return null;
}

function validateDisplayName(displayName: string): string | null {
  if (!displayName || typeof displayName !== 'string') return 'Display name is required';
  const trimmed = displayName.trim();
  if (trimmed.length < 1) return 'Display name is required';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) return `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`;
  if (!DISPLAY_NAME_REGEX.test(trimmed)) return 'Display name contains invalid characters';
  return null;
}

// ─── Auth Service ──────────────────────────────────────────────────

export class AuthService {
  constructor(private db: TrackerDB) {}

  async register(
    username: string,
    password: string,
    displayName: string
  ): Promise<{ user: AuthUser } | { error: string; field?: string }> {
    // Validate inputs
    const usernameErr = validateUsername(username);
    if (usernameErr) return { error: usernameErr, field: 'username' };

    const passwordErr = validatePassword(password);
    if (passwordErr) return { error: passwordErr, field: 'password' };

    const displayErr = validateDisplayName(displayName);
    if (displayErr) return { error: displayErr, field: 'displayName' };

    // Check if username is taken
    const existing = this.db.getUserByUsername(username.trim());
    if (existing) return { error: 'Username is already taken', field: 'username' };

    // Hash password and create user
    const hash = await hashPassword(password);
    const userId = this.db.createUser(username.trim(), displayName.trim(), hash);

    const stats = this.db.getUserGameStats(userId);
    return {
      user: {
        id: userId,
        username: username.trim(),
        displayName: displayName.trim(),
        createdAt: new Date().toISOString(),
        gamesPlayed: stats.games_played,
        gamesWon: stats.games_won,
      },
    };
  }

  async login(
    username: string,
    password: string,
    ip: string | null,
    userAgent: string | null
  ): Promise<{ user: AuthUser; token: string } | { error: string }> {
    // Validate inputs (generic errors — don't reveal which field is wrong)
    if (!username?.trim() || !password) {
      return { error: 'Invalid credentials' };
    }

    const user = this.db.getUserByUsername(username.trim());
    if (!user) {
      // Perform a dummy hash to prevent timing-based user enumeration
      await hashPassword(password);
      return { error: 'Invalid credentials' };
    }

    // Check account lockout
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until + 'Z').getTime();
      if (Date.now() < lockedUntil) {
        const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60_000);
        return { error: `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}` };
      }
    }

    // Verify password
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      this.db.recordLoginFailure(user.id);
      if (attempts >= MAX_FAILED_LOGINS) {
        this.db.lockAccount(user.id, LOCKOUT_MINUTES);
        return { error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes` };
      }
      return { error: 'Invalid credentials' };
    }

    // Success — reset failures and create session
    this.db.recordLoginSuccess(user.id);

    // Enforce max sessions per user (prune oldest if needed)
    const sessionCount = this.db.countUserSessions(user.id);
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      this.db.pruneOldestUserSessions(user.id, MAX_SESSIONS_PER_USER - 1);
    }

    const token = randomBytes(32).toString('hex');
    this.db.createUserSession(token, user.id, SESSION_EXPIRY_HOURS, ip, userAgent);

    const stats = this.db.getUserGameStats(user.id);
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        createdAt: user.created_at,
        gamesPlayed: stats.games_played,
        gamesWon: stats.games_won,
      },
    };
  }

  logout(token: string): void {
    this.db.deleteUserSession(token);
  }

  logoutAll(userId: number): void {
    this.db.deleteAllUserSessions(userId);
  }

  validateSession(token: string): { userId: number } | null {
    if (!token || typeof token !== 'string') return null;
    const session = this.db.validateUserSession(token);
    return session ? { userId: session.user_id } : null;
  }

  getUser(token: string): AuthUser | null {
    const session = this.validateSession(token);
    if (!session) return null;

    const user = this.db.getUserById(session.userId);
    if (!user) return null;

    const stats = this.db.getUserGameStats(user.id);
    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      createdAt: user.created_at,
      gamesPlayed: stats.games_played,
      gamesWon: stats.games_won,
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: true } | { error: string }> {
    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return { error: passwordErr };

    const currentHash = this.db.getUserPasswordHash(userId);
    if (!currentHash) return { error: 'User not found' };

    const valid = await verifyPassword(currentPassword, currentHash);
    if (!valid) return { error: 'Current password is incorrect' };

    const newHash = await hashPassword(newPassword);
    this.db.updateUserPassword(userId, newHash);

    // Invalidate all other sessions on password change (security best practice)
    this.db.deleteAllUserSessions(userId);

    return { success: true };
  }

  async deleteAccount(userId: number, password: string): Promise<{ success: true } | { error: string }> {
    const currentHash = this.db.getUserPasswordHash(userId);
    if (!currentHash) return { error: 'User not found' };

    const valid = await verifyPassword(password, currentHash);
    if (!valid) return { error: 'Password is incorrect' };

    // Delete all sessions first, then user (cascade handles sessions but be explicit)
    this.db.deleteAllUserSessions(userId);
    this.db.deleteUser(userId);

    return { success: true };
  }

  cleanExpiredSessions(): void {
    this.db.cleanExpiredUserSessions();
  }
}
