import { useState } from 'react';
import { useAuthStore } from '../stores/authStore.js';

const AVATARS = [
  'zeus', 'athena', 'poseidon', 'apollo', 'artemis', 'hermes',
  'ares', 'hera', 'aphrodite', 'hephaestus', 'demeter', 'dionysus',
];

const AVATAR_EMOJIS: Record<string, string> = {
  zeus: '\u26A1', athena: '\uD83E\uDD89', poseidon: '\uD83D\uDD31', apollo: '\u2600\uFE0F',
  artemis: '\uD83C\uDF19', hermes: '\uD83D\uDC5F', ares: '\u2694\uFE0F', hera: '\uD83D\uDC51',
  aphrodite: '\uD83C\uDF39', hephaestus: '\uD83D\uDD28', demeter: '\uD83C\uDF3E', dionysus: '\uD83C\uDF47',
};

function canChangeDisplayName(changedAt: string | null): { canChange: boolean; daysLeft: number } {
  if (!changedAt) return { canChange: true, daysLeft: 0 };
  const changed = new Date(changedAt + 'Z').getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - changed;
  if (elapsed >= thirtyDays) return { canChange: true, daysLeft: 0 };
  return { canChange: false, daysLeft: Math.ceil((thirtyDays - elapsed) / (24 * 60 * 60 * 1000)) };
}

export function Profile({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const changeDisplayName = useAuthStore((s) => s.changeDisplayName);
  const changeAvatar = useAuthStore((s) => s.changeAvatar);
  const changePassword = useAuthStore((s) => s.changePassword);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const logout = useAuthStore((s) => s.logout);

  const [editingName, setEditingName] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const { canChange, daysLeft } = canChangeDisplayName(user.displayNameChangedAt);

  const handleChangeName = async () => {
    if (!newDisplayName.trim()) return;
    setSubmitting(true);
    setNameError(null);
    const result = await changeDisplayName(newDisplayName.trim());
    setSubmitting(false);
    if (result.success) {
      setEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } else {
      setNameError(result.error || 'Failed');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    setSubmitting(true);
    setPasswordError(null);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);
    if (result.success) {
      setShowPasswordForm(false);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setPasswordSuccess(false); logout(); }, 2000);
    } else {
      setPasswordError(result.error || 'Failed');
    }
  };

  const handleDeleteAccount = async () => {
    setSubmitting(true);
    setDeleteError(null);
    const result = await deleteAccount(deletePassword);
    setSubmitting(false);
    if (result.success) {
      // Account deleted, user is logged out
    } else {
      setDeleteError(result.error || 'Failed');
    }
  };

  const handleAvatarSelect = async (avatar: string) => {
    await changeAvatar(avatar);
  };

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  });

  return (
    <div className="profile-fullscreen">
      <div className="profile-container">
        <div className="profile-header">
          <button className="btn-link profile-back" onClick={onBack}>&larr; Back</button>
          <h2 className="profile-title">Profile</h2>
        </div>

        {/* Avatar Section */}
        <div className="profile-section profile-avatar-section">
          <div className="profile-current-avatar">
            <span className="profile-avatar-large">{user.avatar ? AVATAR_EMOJIS[user.avatar] || '?' : '\uD83C\uDFDB\uFE0F'}</span>
          </div>
          <div className="profile-avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`profile-avatar-option ${user.avatar === a ? 'selected' : ''}`}
                onClick={() => handleAvatarSelect(a)}
                title={a.charAt(0).toUpperCase() + a.slice(1)}
              >
                <span className="profile-avatar-emoji">{AVATAR_EMOJIS[a]}</span>
                <span className="profile-avatar-label">{a}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Info Section */}
        <div className="profile-section">
          <div className="profile-info-row">
            <span className="profile-info-label">Username</span>
            <span className="profile-info-value">{user.username}</span>
          </div>

          <div className="profile-info-row">
            <span className="profile-info-label">Display Name</span>
            {editingName ? (
              <div className="profile-edit-inline">
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  maxLength={20}
                  className="input input-greek input-profile"
                  autoFocus
                />
                <button className="btn btn-olympus btn-profile-save" onClick={handleChangeName} disabled={submitting}>
                  {submitting ? '...' : 'Save'}
                </button>
                <button className="btn-link" onClick={() => { setEditingName(false); setNameError(null); }}>Cancel</button>
                {nameError && <p className="error profile-inline-error">{nameError}</p>}
              </div>
            ) : (
              <span className="profile-info-value">
                {user.displayName}
                {canChange ? (
                  <button className="btn-link profile-edit-btn" onClick={() => { setEditingName(true); setNewDisplayName(user.displayName); }}>Edit</button>
                ) : (
                  <span className="profile-info-hint">Can change in {daysLeft}d</span>
                )}
                {nameSuccess && <span className="profile-success-inline">Updated!</span>}
              </span>
            )}
          </div>

          <div className="profile-info-row">
            <span className="profile-info-label">Email</span>
            <span className="profile-info-value">{user.email || 'Not set'}</span>
          </div>

          <div className="profile-info-row">
            <span className="profile-info-label">Google</span>
            <span className="profile-info-value">
              {user.hasGoogle ? (
                <span className="profile-google-linked">Linked <span className="profile-check">{'\u2705'}</span></span>
              ) : (
                <span className="profile-google-unlinked">Not linked</span>
              )}
            </span>
          </div>

          <div className="profile-info-row">
            <span className="profile-info-label">Friends</span>
            <span className="profile-info-value">{user.friendCount}</span>
          </div>

          <div className="profile-info-row">
            <span className="profile-info-label">Member Since</span>
            <span className="profile-info-value">{memberSince}</span>
          </div>
        </div>

        {/* Stats Section */}
        <div className="profile-section">
          <h3 className="profile-section-title">Game Stats</h3>
          <div className="profile-stats-grid">
            <div className="profile-stat">
              <span className="profile-stat-value">{user.gamesPlayed}</span>
              <span className="profile-stat-label">Games Played</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{user.gamesWon}</span>
              <span className="profile-stat-label">Games Won</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-value">{user.gamesPlayed > 0 ? Math.round((user.gamesWon / user.gamesPlayed) * 100) : 0}%</span>
              <span className="profile-stat-label">Win Rate</span>
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="profile-section">
          {passwordSuccess && <p className="auth-success">Password changed! You will be signed out.</p>}
          {!showPasswordForm ? (
            <button className="btn btn-olympus btn-profile-action" onClick={() => setShowPasswordForm(true)}>
              {user.hasPassword ? 'Change Password' : 'Set Password'}
            </button>
          ) : (
            <form onSubmit={handleChangePassword} className="profile-password-form">
              <h3 className="profile-section-title">{user.hasPassword ? 'Change Password' : 'Set Password'}</h3>
              {user.hasPassword && (
                <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input input-greek" autoComplete="current-password" required />
              )}
              <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={128} className="input input-greek" autoComplete="new-password" required />
              <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input input-greek" autoComplete="new-password" required />
              {passwordError && <p className="error">{passwordError}</p>}
              <div className="profile-form-actions">
                <button type="submit" className="btn btn-olympus btn-profile-save" disabled={submitting}>{submitting ? '...' : 'Save'}</button>
                <button type="button" className="btn-link" onClick={() => { setShowPasswordForm(false); setPasswordError(null); }}>Cancel</button>
              </div>
            </form>
          )}
        </div>

        {/* Danger Zone */}
        <div className="profile-section profile-danger-zone">
          {!showDeleteConfirm ? (
            <button className="btn btn-olympus btn-danger" onClick={() => setShowDeleteConfirm(true)}>
              Delete Account
            </button>
          ) : (
            <div className="profile-delete-confirm">
              <p className="profile-delete-warning">This action is permanent and cannot be undone. All your data will be deleted.</p>
              {user.hasPassword && (
                <input type="password" placeholder="Enter your password to confirm" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="input input-greek" autoComplete="current-password" />
              )}
              {deleteError && <p className="error">{deleteError}</p>}
              <div className="profile-form-actions">
                <button className="btn btn-olympus btn-danger" onClick={handleDeleteAccount} disabled={submitting}>
                  {submitting ? '...' : 'Confirm Delete'}
                </button>
                <button className="btn-link" onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
