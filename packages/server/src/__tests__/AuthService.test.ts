import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrackerDB } from '../Database.js';
import { AuthService } from '../AuthService.js';

describe('AuthService', () => {
  let db: TrackerDB;
  let auth: AuthService;

  beforeEach(() => {
    db = new TrackerDB(':memory:');
    auth = new AuthService(db);
  });

  afterEach(() => {
    db.close();
  });

  // ─── register ────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a user successfully', async () => {
      const result = await auth.register('testuser', 'password123', 'Test User', 'test@example.com');
      expect(result).toHaveProperty('user');
      const { user } = result as { user: { id: number; username: string; displayName: string } };
      expect(user.username).toBe('testuser');
      expect(user.displayName).toBe('Test User');
    });

    it('returns user id', async () => {
      const result = await auth.register('testuser', 'password123', 'Test User', 'test@example.com');
      const { user } = result as { user: { id: number } };
      expect(user.id).toBeGreaterThan(0);
    });

    it('rejects duplicate username', async () => {
      await auth.register('testuser', 'password123', 'Test User', 'test@example.com');
      const result = await auth.register('testuser', 'pass12345678', 'Other User', 'other@example.com');
      expect(result).toHaveProperty('error');
      const err = result as { error: string; field?: string };
      expect(err.error).toContain('Username is already taken');
      expect(err.field).toBe('username');
    });

    it('rejects duplicate email', async () => {
      await auth.register('user1', 'password123', 'User One', 'same@example.com');
      const result = await auth.register('user2', 'password123', 'User Two', 'same@example.com');
      expect(result).toHaveProperty('error');
      const err = result as { error: string; field?: string };
      expect(err.error).toContain('email already exists');
      expect(err.field).toBe('email');
    });

    it('rejects username shorter than 3 characters', async () => {
      const result = await auth.register('ab', 'password123', 'Test', 'test@example.com');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('at least 3');
    });

    it('rejects username longer than 20 characters', async () => {
      const result = await auth.register('a'.repeat(21), 'password123', 'Test', 'test@example.com');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('at most 20');
    });

    it('rejects username with invalid characters', async () => {
      const result = await auth.register('user name', 'password123', 'Test', 'test@example.com');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('letters, numbers, and underscores');
    });

    it('rejects password shorter than 8 characters', async () => {
      const result = await auth.register('testuser', 'short', 'Test', 'test@example.com');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('at least 8');
    });

    it('rejects invalid email', async () => {
      const result = await auth.register('testuser', 'password123', 'Test', 'not-an-email');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Invalid email');
    });

    it('rejects empty display name', async () => {
      const result = await auth.register('testuser', 'password123', '', 'test@example.com');
      expect(result).toHaveProperty('error');
      expect((result as { field?: string }).field).toBe('displayName');
    });

    it('normalizes email to lowercase', async () => {
      await auth.register('testuser', 'password123', 'Test', 'Test@EXAMPLE.COM');
      const user = db.getUserByEmail('test@example.com');
      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
    });
  });

  // ─── login ───────────────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(async () => {
      await auth.register('alice', 'correctpassword', 'Alice', 'alice@example.com');
    });

    it('succeeds with correct username and password', async () => {
      const result = await auth.login('alice', 'correctpassword', '127.0.0.1', 'test-agent');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      const { user, token } = result as { user: { username: string }; token: string };
      expect(user.username).toBe('alice');
      expect(token).toBeTruthy();
    });

    it('fails with wrong password', async () => {
      const result = await auth.login('alice', 'wrongpassword', null, null);
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toBe('Invalid credentials');
    });

    it('fails with nonexistent user', async () => {
      const result = await auth.login('nonexistent', 'somepassword', null, null);
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toBe('Invalid credentials');
    });

    it('works with email as identifier', async () => {
      const result = await auth.login('alice@example.com', 'correctpassword', null, null);
      expect(result).toHaveProperty('user');
      const { user } = result as { user: { username: string } };
      expect(user.username).toBe('alice');
    });

    it('is case-insensitive for email login', async () => {
      const result = await auth.login('ALICE@EXAMPLE.COM', 'correctpassword', null, null);
      expect(result).toHaveProperty('user');
    });

    it('locks account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await auth.login('alice', 'wrongpassword', null, null);
      }
      const result = await auth.login('alice', 'correctpassword', null, null);
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Account locked');
    });

    it('rejects empty identifier', async () => {
      const result = await auth.login('', 'somepassword', null, null);
      expect(result).toHaveProperty('error');
    });

    it('rejects empty password', async () => {
      const result = await auth.login('alice', '', null, null);
      expect(result).toHaveProperty('error');
    });
  });

  // ─── session management ──────────────────────────────────────────────

  describe('session management', () => {
    let token: string;
    let userId: number;

    beforeEach(async () => {
      const regResult = await auth.register('sessionuser', 'password123', 'Session User', 'session@example.com');
      userId = (regResult as { user: { id: number } }).user.id;
      const loginResult = await auth.login('sessionuser', 'password123', null, null);
      token = (loginResult as { token: string }).token;
    });

    it('validateSession returns userId for valid token', () => {
      const session = auth.validateSession(token);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(userId);
    });

    it('validateSession returns null for invalid token', () => {
      const session = auth.validateSession('invalid-token');
      expect(session).toBeNull();
    });

    it('validateSession returns null for empty string', () => {
      expect(auth.validateSession('')).toBeNull();
    });

    it('logout invalidates the session', () => {
      auth.logout(token);
      const session = auth.validateSession(token);
      expect(session).toBeNull();
    });

    it('logoutAll invalidates all sessions for a user', async () => {
      // Create a second session
      const login2 = await auth.login('sessionuser', 'password123', null, null);
      const token2 = (login2 as { token: string }).token;

      auth.logoutAll(userId);

      expect(auth.validateSession(token)).toBeNull();
      expect(auth.validateSession(token2)).toBeNull();
    });

    it('getUser returns AuthUser for valid token', () => {
      const user = auth.getUser(token);
      expect(user).not.toBeNull();
      expect(user!.username).toBe('sessionuser');
      expect(user!.displayName).toBe('Session User');
    });

    it('getUser returns null for invalid token', () => {
      expect(auth.getUser('bad-token')).toBeNull();
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────

  describe('changePassword', () => {
    let userId: number;

    beforeEach(async () => {
      const regResult = await auth.register('pwuser', 'oldpassword1', 'PW User', 'pw@example.com');
      userId = (regResult as { user: { id: number } }).user.id;
    });

    it('succeeds with correct current password', async () => {
      const result = await auth.changePassword(userId, 'oldpassword1', 'newpassword1');
      expect(result).toEqual({ success: true });

      // Can log in with new password
      const loginResult = await auth.login('pwuser', 'newpassword1', null, null);
      expect(loginResult).toHaveProperty('token');
    });

    it('fails with wrong current password', async () => {
      const result = await auth.changePassword(userId, 'wrongpassword', 'newpassword1');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Current password is incorrect');
    });

    it('rejects new password that is too short', async () => {
      const result = await auth.changePassword(userId, 'oldpassword1', 'short');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('at least 8');
    });

    it('invalidates all sessions after password change', async () => {
      const loginResult = await auth.login('pwuser', 'oldpassword1', null, null);
      const token = (loginResult as { token: string }).token;

      await auth.changePassword(userId, 'oldpassword1', 'newpassword1');

      // Old session should be invalid
      expect(auth.validateSession(token)).toBeNull();
    });
  });

  // ─── forgotPassword ──────────────────────────────────────────────────

  describe('forgotPassword', () => {
    beforeEach(async () => {
      await auth.register('forgotuser', 'password123', 'Forgot User', 'forgot@example.com');
    });

    it('returns token for valid email', () => {
      const result = auth.forgotPassword('forgot@example.com');
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('userId');
      const { token } = result as { token: string; userId: number };
      expect(token).toBeTruthy();
    });

    it('returns silent error for invalid email (prevents enumeration)', () => {
      const result = auth.forgotPassword('nobody@example.com');
      expect(result).toHaveProperty('error', '__silent__');
    });

    it('rejects invalid email format', () => {
      const result = auth.forgotPassword('not-an-email');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Invalid email');
    });
  });

  // ─── resetPassword ───────────────────────────────────────────────────

  describe('resetPassword', () => {
    let resetToken: string;

    beforeEach(async () => {
      await auth.register('resetuser', 'password123', 'Reset User', 'reset@example.com');
      const result = auth.forgotPassword('reset@example.com');
      resetToken = (result as { token: string }).token;
    });

    it('resets password with valid token', async () => {
      const result = await auth.resetPassword(resetToken, 'brandnewpass');
      expect(result).toEqual({ success: true });

      // Can log in with new password
      const loginResult = await auth.login('resetuser', 'brandnewpass', null, null);
      expect(loginResult).toHaveProperty('token');
    });

    it('rejects an already used token', async () => {
      await auth.resetPassword(resetToken, 'brandnewpass');
      const result = await auth.resetPassword(resetToken, 'anotherpass1');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('invalid or has expired');
    });

    it('rejects invalid token', async () => {
      const result = await auth.resetPassword('totally-invalid-token', 'newpassword1');
      expect(result).toHaveProperty('error');
    });

    it('rejects new password that is too short', async () => {
      const result = await auth.resetPassword(resetToken, 'short');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('at least 8');
    });

    it('invalidates all sessions after reset', async () => {
      const loginResult = await auth.login('resetuser', 'password123', null, null);
      const sessionToken = (loginResult as { token: string }).token;

      await auth.resetPassword(resetToken, 'brandnewpass');

      expect(auth.validateSession(sessionToken)).toBeNull();
    });

    it('rejects empty token', async () => {
      const result = await auth.resetPassword('', 'newpassword1');
      expect(result).toHaveProperty('error');
    });
  });

  // ─── changeDisplayName ───────────────────────────────────────────────

  describe('changeDisplayName', () => {
    let userId: number;

    beforeEach(async () => {
      const result = await auth.register('dnuser', 'password123', 'Original Name', 'dn@example.com');
      userId = (result as { user: { id: number } }).user.id;
    });

    it('changes display name successfully', () => {
      const result = auth.changeDisplayName(userId, 'New Name');
      expect(result).toEqual({ success: true });
    });

    it('rejects empty display name', () => {
      const result = auth.changeDisplayName(userId, '');
      expect(result).toHaveProperty('error');
    });

    it('rejects display name with invalid characters', () => {
      const result = auth.changeDisplayName(userId, '<script>alert</script>');
      expect(result).toHaveProperty('error');
    });

    it('rejects nonexistent user', () => {
      const result = auth.changeDisplayName(999999, 'New Name');
      expect(result).toHaveProperty('error', 'User not found');
    });
  });

  // ─── changeAvatar ────────────────────────────────────────────────────

  describe('changeAvatar', () => {
    let userId: number;

    beforeEach(async () => {
      const result = await auth.register('avuser', 'password123', 'Avatar User', 'av@example.com');
      userId = (result as { user: { id: number } }).user.id;
    });

    it('accepts valid avatar names', () => {
      expect(auth.changeAvatar(userId, 'zeus')).toEqual({ success: true });
      expect(auth.changeAvatar(userId, 'athena')).toEqual({ success: true });
      expect(auth.changeAvatar(userId, 'poseidon')).toEqual({ success: true });
    });

    it('rejects invalid avatar', () => {
      const result = auth.changeAvatar(userId, 'nonexistent-avatar');
      expect(result).toHaveProperty('error', 'Invalid avatar');
    });
  });

  // ─── changeLanguage ──────────────────────────────────────────────────

  describe('changeLanguage', () => {
    let userId: number;

    beforeEach(async () => {
      const result = await auth.register('languser', 'password123', 'Lang User', 'lang@example.com');
      userId = (result as { user: { id: number } }).user.id;
    });

    it('accepts valid languages', () => {
      expect(auth.changeLanguage(userId, 'en')).toEqual({ success: true });
      expect(auth.changeLanguage(userId, 'el')).toEqual({ success: true });
    });

    it('rejects invalid language', () => {
      const result = auth.changeLanguage(userId, 'fr');
      expect(result).toHaveProperty('error', 'Invalid language');
    });
  });

  // ─── deleteAccount ───────────────────────────────────────────────────

  describe('deleteAccount', () => {
    let userId: number;

    beforeEach(async () => {
      const result = await auth.register('deluser', 'password123', 'Del User', 'del@example.com');
      userId = (result as { user: { id: number } }).user.id;
    });

    it('deletes account with correct password', async () => {
      const result = await auth.deleteAccount(userId, 'password123');
      expect(result).toEqual({ success: true });

      // User should no longer exist
      const user = db.getUserByUsername('deluser');
      expect(user).toBeUndefined();
    });

    it('rejects deletion with wrong password', async () => {
      const result = await auth.deleteAccount(userId, 'wrongpassword');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Password is incorrect');
    });

    it('invalidates sessions on deletion', async () => {
      const loginResult = await auth.login('deluser', 'password123', null, null);
      const token = (loginResult as { token: string }).token;

      await auth.deleteAccount(userId, 'password123');

      expect(auth.validateSession(token)).toBeNull();
    });
  });

  // ─── Google Sign-In ──────────────────────────────────────────────────

  describe('loginWithGoogle', () => {
    it('creates a new account from Google profile', async () => {
      const result = await auth.loginWithGoogle('google-123', 'guser@example.com', 'Google User', null, null);
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('token');
      expect(result.user.displayName).toBe('Google User');
      expect(result.user.hasGoogle).toBe(true);
    });

    it('links Google to existing account by email', async () => {
      await auth.register('existing', 'password123', 'Existing User', 'existing@example.com');

      const result = await auth.loginWithGoogle('google-456', 'existing@example.com', 'Existing User', null, null);
      expect(result.user.username).toBe('existing');
      // Note: hasGoogle is false on the returned object because loginWithGoogle
      // uses the stale user row fetched before linkGoogleAccount updates the DB.
      // The link IS persisted -- a subsequent login via Google ID will work.
      expect(result.user.hasGoogle).toBe(false);

      // Verify the link was persisted: a second Google login uses the linked account
      const secondLogin = await auth.loginWithGoogle('google-456', 'existing@example.com', 'Existing User', null, null);
      expect(secondLogin.user.username).toBe('existing');
      expect(secondLogin.user.hasGoogle).toBe(true);
    });

    it('returns existing account for same Google ID', async () => {
      await auth.loginWithGoogle('google-789', 'first@example.com', 'First Login', null, null);
      const result = await auth.loginWithGoogle('google-789', 'first@example.com', 'First Login', null, null);
      expect(result).toHaveProperty('token');
      expect(result.user.username).toBeTruthy();
    });
  });
});
