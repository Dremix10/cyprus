import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_EXPIRY_MINUTES = 60;

// ─── Password Hashing ──────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P,
  }) as Buffer;
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
  try {
    return timingSafeEqual(derived, expectedHash);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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

function validateEmail(email: string): string | null {
  if (!email || typeof email !== 'string') return 'Email is required';
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) return 'Email is too long';
  if (!EMAIL_REGEX.test(trimmed)) return 'Invalid email address';
  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────

type UserRow = NonNullable<ReturnType<TrackerDB['getUserByUsername']>>;

function buildAuthUser(
  user: { id: number; username: string; display_name: string; created_at: string; email?: string | null; password_hash?: string | null; google_id?: string | null; avatar?: string | null; display_name_changed_at?: string | null; language?: string | null },
  stats: { games_played: number; games_won: number },
  friendCount: number = 0
): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email ?? null,
    hasPassword: !!user.password_hash,
    hasGoogle: !!user.google_id,
    createdAt: user.created_at,
    gamesPlayed: stats.games_played,
    gamesWon: stats.games_won,
    avatar: user.avatar ?? null,
    displayNameChangedAt: user.display_name_changed_at ?? null,
    friendCount,
    language: user.language ?? null,
  };
}

// ─── Auth Service ──────────────────────────────────────────────────

export class AuthService {
  constructor(private db: TrackerDB) {}

  private createSessionForUser(userId: number, ip: string | null, userAgent: string | null): string {
    const sessionCount = this.db.countUserSessions(userId);
    if (sessionCount >= MAX_SESSIONS_PER_USER) {
      this.db.pruneOldestUserSessions(userId, MAX_SESSIONS_PER_USER - 1);
    }
    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    this.db.createUserSession(tokenHash, userId, SESSION_EXPIRY_HOURS, ip, userAgent);
    return token;
  }

  // ─── Register ───────────────────────────────────────────────────

  async register(
    username: string,
    password: string,
    displayName: string,
    email: string
  ): Promise<{ user: AuthUser } | { error: string; field?: string }> {
    const usernameErr = validateUsername(username);
    if (usernameErr) return { error: usernameErr, field: 'username' };
    const passwordErr = validatePassword(password);
    if (passwordErr) return { error: passwordErr, field: 'password' };
    const displayErr = validateDisplayName(displayName);
    if (displayErr) return { error: displayErr, field: 'displayName' };
    const emailErr = validateEmail(email);
    if (emailErr) return { error: emailErr, field: 'email' };

    const normalizedEmail = email.trim().toLowerCase();

    if (this.db.getUserByUsername(username.trim())) {
      return { error: 'Username is already taken', field: 'username' };
    }
    if (this.db.getUserByEmail(normalizedEmail)) {
      return { error: 'An account with this email already exists', field: 'email' };
    }

    const hash = await hashPassword(password);
    const userId = this.db.createUser(username.trim(), displayName.trim(), hash, normalizedEmail);

    const stats = this.db.getUserGameStats(userId);
    return { user: buildAuthUser({ id: userId, username: username.trim(), display_name: displayName.trim(), created_at: new Date().toISOString(), email: normalizedEmail, password_hash: hash, google_id: null }, stats) };
  }

  // ─── Login (username or email) ──────────────────────────────────

  async login(
    identifier: string,
    password: string,
    ip: string | null,
    userAgent: string | null
  ): Promise<{ user: AuthUser; token: string } | { error: string }> {
    if (!identifier?.trim() || !password) {
      return { error: 'Invalid credentials' };
    }

    // Try username first, then email
    const trimmed = identifier.trim();
    let user: UserRow | undefined = this.db.getUserByUsername(trimmed);
    if (!user && trimmed.includes('@')) {
      user = this.db.getUserByEmail(trimmed.toLowerCase());
    }

    if (!user) {
      await hashPassword(password); // timing-safe: prevent user enumeration
      return { error: 'Invalid credentials' };
    }

    if (!user.password_hash) {
      return { error: 'This account uses Google Sign-In. Please sign in with Google' };
    }

    // Check lockout
    if (user.locked_until) {
      const lockedUntil = new Date(user.locked_until + 'Z').getTime();
      if (Date.now() < lockedUntil) {
        const minutesLeft = Math.ceil((lockedUntil - Date.now()) / 60_000);
        return { error: `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}` };
      }
    }

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

    this.db.recordLoginSuccess(user.id);
    const token = this.createSessionForUser(user.id, ip, userAgent);
    const stats = this.db.getUserGameStats(user.id);
    return { token, user: buildAuthUser(user, stats) };
  }

  // ─── Google Sign-In ─────────────────────────────────────────────

  async loginWithGoogle(
    googleId: string,
    email: string,
    name: string,
    ip: string | null,
    userAgent: string | null
  ): Promise<{ user: AuthUser; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if Google account is already linked
    let user = this.db.getUserByGoogleId(googleId);

    if (!user) {
      // Check if email matches an existing account — link it
      user = this.db.getUserByEmail(normalizedEmail);
      if (user) {
        this.db.linkGoogleAccount(user.id, googleId, normalizedEmail);
      }
    }

    if (!user) {
      // Create new account from Google profile
      // Generate a unique username from the email prefix
      let baseUsername = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      if (baseUsername.length < USERNAME_MIN_LENGTH) baseUsername = baseUsername + '_user';
      if (baseUsername.length > USERNAME_MAX_LENGTH) baseUsername = baseUsername.slice(0, USERNAME_MAX_LENGTH);

      let username = baseUsername;
      let suffix = 1;
      while (this.db.getUserByUsername(username)) {
        const suffixStr = String(suffix);
        username = baseUsername.slice(0, USERNAME_MAX_LENGTH - suffixStr.length) + suffixStr;
        suffix++;
      }

      const displayName = name.slice(0, DISPLAY_NAME_MAX_LENGTH) || username;
      const userId = this.db.createUser(username, displayName, null, normalizedEmail, googleId);
      user = this.db.getUserByUsername(username)!;
    }

    this.db.recordLoginSuccess(user.id);
    const token = this.createSessionForUser(user.id, ip, userAgent);
    const stats = this.db.getUserGameStats(user.id);
    return { token, user: buildAuthUser(user, stats) };
  }

  // ─── Forgot / Reset Password ────────────────────────────────────

  forgotPassword(email: string): { token: string; userId: number } | { error: string } {
    const emailErr = validateEmail(email);
    if (emailErr) return { error: emailErr };

    const user = this.db.getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      // Don't reveal whether the email exists — return silently
      return { error: '__silent__' };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    this.db.createPasswordResetToken(tokenHash, user.id, RESET_TOKEN_EXPIRY_MINUTES);

    return { token, userId: user.id };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: true } | { error: string }> {
    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return { error: passwordErr };

    if (!token || typeof token !== 'string') return { error: 'Invalid reset link' };

    const tokenHash = hashToken(token);
    const row = this.db.validatePasswordResetToken(tokenHash);
    if (!row) return { error: 'Reset link is invalid or has expired' };

    const newHash = await hashPassword(newPassword);
    this.db.updateUserPassword(row.user_id, newHash);
    this.db.markPasswordResetTokenUsed(tokenHash);
    this.db.deleteAllUserSessions(row.user_id);

    return { success: true };
  }

  // ─── Session Management ─────────────────────────────────────────

  logout(token: string): void {
    this.db.deleteUserSession(hashToken(token));
  }

  logoutAll(userId: number): void {
    this.db.deleteAllUserSessions(userId);
  }

  validateSession(token: string): { userId: number } | null {
    if (!token || typeof token !== 'string') return null;
    const session = this.db.validateUserSession(hashToken(token));
    return session ? { userId: session.user_id } : null;
  }

  getUser(token: string): AuthUser | null {
    const session = this.validateSession(token);
    if (!session) return null;

    const user = this.db.getUserById(session.userId);
    if (!user) return null;

    const fullUser = this.db.getUserByUsername(user.username);
    const stats = this.db.getUserGameStats(user.id);
    const friendCount = this.db.getFriendCount(user.id);
    return buildAuthUser({ ...user, password_hash: fullUser?.password_hash, google_id: fullUser?.google_id }, stats, friendCount);
  }

  // ─── Account Management ─────────────────────────────────────────

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: true } | { error: string }> {
    const passwordErr = validatePassword(newPassword);
    if (passwordErr) return { error: passwordErr };

    const currentHash = this.db.getUserPasswordHash(userId);
    if (currentHash) {
      // Has existing password — verify it
      const valid = await verifyPassword(currentPassword, currentHash);
      if (!valid) return { error: 'Current password is incorrect' };
    }
    // Google-only users can set a password without providing current

    const newHash = await hashPassword(newPassword);
    this.db.updateUserPassword(userId, newHash);
    this.db.deleteAllUserSessions(userId);
    return { success: true };
  }

  async deleteAccount(userId: number, password: string): Promise<{ success: true } | { error: string }> {
    const currentHash = this.db.getUserPasswordHash(userId);
    if (currentHash) {
      const valid = await verifyPassword(password, currentHash);
      if (!valid) return { error: 'Password is incorrect' };
    }
    // Google-only users: allow deletion with empty password (they authenticated via Google)

    this.db.deleteAllUserSessions(userId);
    this.db.deleteUser(userId);
    return { success: true };
  }

  changeDisplayName(userId: number, newDisplayName: string): { success: true } | { error: string } {
    const nameErr = validateDisplayName(newDisplayName);
    if (nameErr) return { error: nameErr };

    const user = this.db.getUserById(userId);
    if (!user) return { error: 'User not found' };

    // Check once-per-month limit
    if (user.display_name_changed_at) {
      const changedAt = new Date(user.display_name_changed_at + 'Z').getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - changedAt < thirtyDays) {
        const daysLeft = Math.ceil((thirtyDays - (Date.now() - changedAt)) / (24 * 60 * 60 * 1000));
        return { error: `You can change your display name again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` };
      }
    }

    this.db.updateDisplayName(userId, newDisplayName.trim());
    return { success: true };
  }

  changeAvatar(userId: number, avatar: string): { success: true } | { error: string } {
    const VALID_AVATARS = [
      'zeus', 'athena', 'poseidon', 'apollo', 'artemis', 'hermes',
      'ares', 'hera', 'aphrodite', 'hephaestus', 'demeter', 'dionysus',
    ];
    if (!VALID_AVATARS.includes(avatar)) return { error: 'Invalid avatar' };
    this.db.updateAvatar(userId, avatar);
    return { success: true };
  }

  changeLanguage(userId: number, language: string): { success: true } | { error: string } {
    const VALID_LANGS = ['en', 'el'];
    if (!VALID_LANGS.includes(language)) return { error: 'Invalid language' };
    this.db.updateLanguage(userId, language);
    return { success: true };
  }

  cleanExpiredSessions(): void {
    this.db.cleanExpiredUserSessions();
    this.db.cleanExpiredResetTokens();
  }
}
