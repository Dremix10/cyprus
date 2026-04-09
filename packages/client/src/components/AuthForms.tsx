import { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';

export function AuthForms({ onGuest }: { onGuest: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (mode === 'login') {
      await login(username, password);
    } else {
      await register(username, password, displayName || username);
    }
    setSubmitting(false);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    clearError();
  };

  return (
    <div className="auth-forms">
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
          className="input input-greek"
          autoComplete="username"
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          maxLength={128}
          className="input input-greek"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
        />

        {mode === 'register' && (
          <input
            type="text"
            placeholder="Display name (shown in game)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            className="input input-greek"
            autoComplete="off"
          />
        )}

        {error && <p className="error">{error}</p>}

        <button
          type="submit"
          className="btn btn-olympus btn-create"
          disabled={submitting}
        >
          {submitting ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      <div className="auth-switch">
        <button className="btn-link" onClick={switchMode}>
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>

      <div className="divider divider-greek">
        <span>or</span>
      </div>

      <button className="btn btn-olympus btn-guest" onClick={onGuest}>
        Play as Guest
      </button>
    </div>
  );
}

export function UserBadge() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  return (
    <div className="user-badge">
      <span className="user-badge-name">{user.displayName}</span>
      <span className="user-badge-stats">
        {user.gamesWon}W / {user.gamesPlayed}G
      </span>
      <button className="btn-link user-badge-logout" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}
