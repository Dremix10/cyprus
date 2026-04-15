import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore.js';

// ─── Google Sign-In ─────────────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

function GoogleSignInButton() {
  const googleClientId = useAuthStore((s) => s.googleClientId);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  const handleCredential = useCallback((response: { credential: string }) => {
    loginWithGoogle(response.credential);
  }, [loginWithGoogle]);

  useEffect(() => {
    if (!googleClientId) return;
    if (!document.getElementById('google-gsi-script')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => setLoaded(true);
      document.head.appendChild(script);
    } else if (window.google) {
      setLoaded(true);
    }
  }, [googleClientId]);

  useEffect(() => {
    if (!loaded || !googleClientId || !buttonRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleCredential,
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      width: 300,
      text: 'signin_with',
    });
  }, [loaded, googleClientId, handleCredential]);

  if (!googleClientId) return null;

  return <div ref={buttonRef} className="google-signin-btn" />;
}

// ─── Reset Password Form (shown when URL has ?resetToken=) ──────────

export function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setSubmitting(true);
    const result = await resetPassword(token, password);
    setSubmitting(false);
    if (result.success) { setSuccess(true); }
    else { setError(result.error || 'Failed'); }
  };

  if (success) {
    return (
      <div className="auth-forms">
        <p className="auth-success">Password reset successfully!</p>
        <button className="btn btn-olympus btn-create" onClick={onDone}>Sign In</button>
      </div>
    );
  }

  return (
    <div className="auth-forms">
      <h3 className="auth-title">Set New Password</h3>
      <form onSubmit={handleSubmit} className="auth-form">
        <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} className="input input-greek" autoComplete="new-password" required />
        <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input input-greek" autoComplete="new-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>{submitting ? '...' : 'Reset Password'}</button>
      </form>
      <button className="btn-link" onClick={onDone}>Back to sign in</button>
    </div>
  );
}

// ─── Auth Forms (Login / Register / Forgot Password) ────────────────

export function AuthForms({ onGuest }: { onGuest: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    if (mode === 'login') {
      await login(username, password);
    } else if (mode === 'register') {
      await register(username, password, displayName || username, email);
    }
    setSubmitting(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await forgotPassword(forgotEmail);
    setSubmitting(false);
    if (result.success) {
      setForgotMessage(result.message || 'Check your email for a reset link');
    } else {
      setForgotMessage(result.error || 'Failed');
    }
  };

  const switchMode = (newMode: 'login' | 'register' | 'forgot') => {
    setMode(newMode);
    clearError();
    setForgotMessage(null);
  };

  if (mode === 'forgot') {
    return (
      <div className="auth-forms">
        <h3 className="auth-title">Reset Password</h3>
        <form onSubmit={handleForgot} className="auth-form">
          <input type="email" placeholder="Enter your email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="input input-greek" autoComplete="email" required />
          {forgotMessage && <p className={forgotMessage.includes('Check') || forgotMessage.includes('reset link') ? 'auth-success' : 'error'}>{forgotMessage}</p>}
          <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>{submitting ? '...' : 'Send Reset Link'}</button>
        </form>
        <button className="btn-link" onClick={() => switchMode('login')}>Back to sign in</button>
      </div>
    );
  }

  return (
    <div className="auth-forms">
      <form onSubmit={handleSubmit} className="auth-form">
        {mode === 'register' && (
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="input input-greek" autoComplete="email" required />
        )}

        <input type="text" placeholder={mode === 'login' ? 'Username or email' : 'Username'} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={mode === 'login' ? 254 : 20} className="input input-greek" autoComplete="username" required />

        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} className="input input-greek" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />

        {mode === 'register' && (
          <input type="text" placeholder="Display name (shown in game)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={20} className="input input-greek" autoComplete="off" />
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>
          {submitting ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {mode === 'login' && (
        <button className="btn-link auth-forgot-link" onClick={() => switchMode('forgot')}>Forgot password?</button>
      )}

      <div className="auth-switch">
        <button className="btn-link" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>

      <div className="divider divider-greek"><span>or</span></div>

      <GoogleSignInButton />

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
      <span className="user-badge-stats">{user.gamesWon}W / {user.gamesPlayed}G</span>
      <button className="btn-link user-badge-logout" onClick={logout}>Sign out</button>
    </div>
  );
}
