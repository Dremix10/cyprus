import { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';
import { useT, useLangStore } from '../i18n.js';
import type { Lang } from '../i18n.js';

// ─── Language Selector ──────────────────────────────────────────────

export function LanguageSelector({ compact }: { compact?: boolean }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const authUser = useAuthStore((s) => s.user);
  const changeLanguage = useAuthStore((s) => s.changeLanguage);

  const handleChange = (newLang: Lang) => {
    setLang(newLang);
    if (authUser) changeLanguage(newLang);
  };

  if (compact) {
    return (
      <div className="lang-toggle">
        <button className={`lang-btn ${lang === 'en' ? 'lang-btn-active' : ''}`} onClick={() => handleChange('en')}>EN</button>
        <button className={`lang-btn ${lang === 'el' ? 'lang-btn-active' : ''}`} onClick={() => handleChange('el')}>EL</button>
      </div>
    );
  }

  return (
    <div className="lang-toggle">
      <button className={`lang-btn ${lang === 'en' ? 'lang-btn-active' : ''}`} onClick={() => handleChange('en')}>English</button>
      <button className={`lang-btn ${lang === 'el' ? 'lang-btn-active' : ''}`} onClick={() => handleChange('el')}>Ελληνικά</button>
    </div>
  );
}

// ─── Google Sign-In (standard OAuth2 redirect) ─────────────────────

function GoogleSignInButton() {
  const googleClientId = useAuthStore((s) => s.googleClientId);
  const t = useT();
  if (!googleClientId) return null;

  const handleClick = () => {
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: window.location.origin + '/auth/google-callback',
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      prompt: 'select_account',
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  return (
    <button className="btn btn-olympus btn-google" onClick={handleClick}>
      {t('auth.signInWithGoogle')}
    </button>
  );
}

// ─── Reset Password Form (shown when URL has ?resetToken=) ──────────

export function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError(t('auth.passwordsMismatch')); return; }
    setSubmitting(true);
    const result = await resetPassword(token, password);
    setSubmitting(false);
    if (result.success) { setSuccess(true); }
    else { setError(result.error || 'Failed'); }
  };

  if (success) {
    return (
      <div className="auth-forms">
        <p className="auth-success">{t('auth.passwordResetSuccess')}</p>
        <button className="btn btn-olympus btn-create" onClick={onDone}>{t('auth.signIn')}</button>
      </div>
    );
  }

  return (
    <div className="auth-forms">
      <h3 className="auth-title">{t('auth.setNewPassword')}</h3>
      <form onSubmit={handleSubmit} className="auth-form">
        <input type="password" placeholder={t('auth.newPassword')} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} className="input input-greek" autoComplete="new-password" required />
        <input type="password" placeholder={t('auth.confirmPassword')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input input-greek" autoComplete="new-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>{submitting ? '...' : t('auth.resetPassword')}</button>
      </form>
      <button className="btn-link" onClick={onDone}>{t('auth.backToSignIn')}</button>
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
  const t = useT();

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
        <h3 className="auth-title">{t('auth.resetPassword')}</h3>
        <form onSubmit={handleForgot} className="auth-form">
          <input type="email" placeholder={t('auth.enterEmail')} value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="input input-greek" autoComplete="email" required />
          {forgotMessage && <p className={forgotMessage.includes('Check') || forgotMessage.includes('reset link') ? 'auth-success' : 'error'}>{forgotMessage}</p>}
          <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>{submitting ? '...' : t('auth.sendResetLink')}</button>
        </form>
        <button className="btn-link" onClick={() => switchMode('login')}>{t('auth.backToSignIn')}</button>
      </div>
    );
  }

  return (
    <div className="auth-forms">
      <LanguageSelector compact />

      <form onSubmit={handleSubmit} className="auth-form">
        {mode === 'register' && (
          <input type="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} className="input input-greek" autoComplete="email" required />
        )}

        <input type="text" placeholder={mode === 'login' ? t('auth.usernameOrEmail') : t('auth.username')} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={mode === 'login' ? 254 : 20} className="input input-greek" autoComplete="username" required />

        <input type="password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} className="input input-greek" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />

        {mode === 'register' && (
          <input type="text" placeholder={t('auth.displayName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={20} className="input input-greek" autoComplete="off" />
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn btn-olympus btn-create" disabled={submitting}>
          {submitting ? '...' : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
        </button>
      </form>

      {mode === 'login' && (
        <button className="btn-link auth-forgot-link" onClick={() => switchMode('forgot')}>{t('auth.forgotPassword')}</button>
      )}

      <div className="auth-switch">
        <button className="btn-link" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
        </button>
      </div>

      <div className="divider divider-greek"><span>{t('auth.or')}</span></div>

      <GoogleSignInButton />

      <button className="btn btn-olympus btn-guest" onClick={onGuest}>
        {t('auth.playAsGuest')}
      </button>
    </div>
  );
}

export function UserBadge({ onProfile }: { onProfile?: () => void }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <div className="user-badge">
      <span className="user-badge-name">{user.displayName}</span>
      <span className="user-badge-stats">{user.gamesWon}W / {user.gamesPlayed}G</span>
      {onProfile && (
        <button className="user-badge-settings" onClick={onProfile} title="Profile & Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}
    </div>
  );
}
