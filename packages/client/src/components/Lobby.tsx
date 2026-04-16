import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { AuthForms, UserBadge } from './AuthForms.js';
import { FriendsPanel } from './Friends.js';
import { useT } from '../i18n.js';

function MeanderBorder() {
  return (
    <div className="meander-border">
      <svg viewBox="0 0 400 12" preserveAspectRatio="none" className="meander-svg">
        <path
          d="M0 6 h8 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h6 v-6 h6 v-6 h6 v6 h6 v6 h8"
          stroke="#c9a84c"
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}

function GreekColumn({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`lobby-column lobby-column-${side}`}>
      <div className="column-ornament column-ornament-top">
        <svg viewBox="0 0 60 80" className="column-svg">
          {/* Ionic capital */}
          <rect x="5" y="60" width="50" height="20" rx="2" fill="#c9a84c" opacity="0.5" />
          <ellipse cx="10" cy="58" rx="10" ry="10" fill="none" stroke="#c9a84c" strokeWidth="2" opacity="0.4" />
          <ellipse cx="50" cy="58" rx="10" ry="10" fill="none" stroke="#c9a84c" strokeWidth="2" opacity="0.4" />
          <rect x="10" y="46" width="40" height="14" rx="1" fill="#c9a84c" opacity="0.35" />
        </svg>
      </div>
      <div className="column-body">
        <div className="column-flutes">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="column-flute-line" />
          ))}
        </div>
      </div>
      <div className="column-ornament column-ornament-bottom">
        <svg viewBox="0 0 60 30" className="column-svg">
          <rect x="0" y="0" width="60" height="8" rx="2" fill="#c9a84c" opacity="0.4" />
          <rect x="5" y="8" width="50" height="6" rx="1" fill="#c9a84c" opacity="0.3" />
          <rect x="10" y="14" width="40" height="16" rx="2" fill="#c9a84c" opacity="0.25" />
        </svg>
      </div>
    </div>
  );
}

export function Lobby({ onTutorial, onLeaderboard, onProfile }: { onTutorial: () => void; onLeaderboard: () => void; onProfile: () => void }) {
  const t = useT();
  const [roomCode, setRoomCode] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [guestMode, setGuestMode] = useState(false);
  const [subView, setSubView] = useState<'none' | 'create' | 'join' | 'solo'>('none');
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const targetScore = useRoomStore((s) => s.targetScore);
  const [scoreInput, setScoreInput] = useState(String(targetScore));
  const setTargetScore = useRoomStore((s) => s.setTargetScore);
  const createRoom = useRoomStore((s) => s.createRoom);
  const setBotDifficulty = useRoomStore((s) => s.setBotDifficulty);
  const botDifficulty = useRoomStore((s) => s.botDifficulty);
  const createSoloRoom = useRoomStore((s) => s.createSoloRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const joinMatchmaking = useRoomStore((s) => s.joinMatchmaking);
  const error = useRoomStore((s) => s.error);
  const staleSession = useRoomStore((s) => s.staleSession);
  const trySessionReconnect = useRoomStore((s) => s.trySessionReconnect);
  const dismissStaleSession = useRoomStore((s) => s.dismissStaleSession);

  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const showGameForm = authUser || guestMode;
  // Pre-fill nickname from display name on first auth load
  const [authPrefilled, setAuthPrefilled] = useState(false);
  if (authUser && !authPrefilled && !nickname) {
    setNickname(authUser.displayName);
    setAuthPrefilled(true);
  }

  return (
    <div className="lobby-fullscreen">
      {/* Background layers */}
      <div className="lobby-bg-clouds" />
      <div className="lobby-bg-zeus" />
      <div className="lobby-bg-overlay" />

      {/* Side columns */}
      <GreekColumn side="left" />
      <GreekColumn side="right" />

      {/* Main content */}
      <div className="lobby-content">
        <div className="lobby-header">
          <h1 className="title-greek">{t('lobby.title')}</h1>
          <p className="subtitle-greek">{t('lobby.subtitle')}</p>
          <MeanderBorder />
        </div>

        <div className="lobby-form-card">
          {staleSession && (
            <div className="reconnect-banner">
              <p>{t('lobby.reconnectBanner', { roomCode: staleSession.roomCode })}</p>
              <div className="reconnect-actions">
                <button className="btn btn-olympus btn-reconnect" onClick={trySessionReconnect}>
                  {t('lobby.reconnect')}
                </button>
                <button className="btn-link reconnect-dismiss" onClick={dismissStaleSession}>
                  {t('lobby.dismiss')}
                </button>
              </div>
            </div>
          )}
          {authUser && <UserBadge onProfile={onProfile} />}
          {authUser && <FriendsPanel />}
          <div className="lobby-form">
            {authLoading ? (
              <p className="auth-loading">{t('lobby.loading')}</p>
            ) : !showGameForm ? (
              <AuthForms onGuest={() => setGuestMode(true)} />
            ) : (
              <>
                <input
                  type="text"
                  placeholder={t('lobby.enterName')}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={16}
                  className="input input-greek"
                />

                {subView === 'none' && (
                  <>
                    <button
                      className="btn btn-olympus btn-play-online"
                      onClick={joinMatchmaking}
                    >
                      {t('lobby.playOnline')}
                    </button>

                    <div className="lobby-room-row">
                      <button
                        className="btn btn-olympus btn-create"
                        onClick={() => setSubView('create')}
                      >
                        {t('lobby.createRoom')}
                      </button>
                      <button
                        className="btn btn-olympus btn-join"
                        onClick={() => setSubView('join')}
                      >
                        {t('lobby.joinRoom')}
                      </button>
                    </div>

                    <button
                      className="btn btn-olympus btn-solo-greek"
                      onClick={() => setSubView('solo')}
                    >
                      {t('lobby.soloGame')}
                    </button>
                  </>
                )}

                {subView === 'create' && (
                  <div className="lobby-subview">
                    <h3 className="lobby-subview-title">{t('lobby.createRoom')}</h3>
                    <div className="target-score-row">
                      <label htmlFor="targetScore">{t('lobby.playTo')}</label>
                      <input
                        id="targetScore"
                        type="number"
                        min={250}
                        step={50}
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(scoreInput, 10);
                          const clamped = isNaN(val) || val < 250 ? 250 : val;
                          setTargetScore(clamped);
                          setScoreInput(String(clamped));
                        }}
                        className="input input-score input-greek"
                      />
                      <span>{t('lobby.pts')}</span>
                    </div>
                    <div className="target-score-row">
                      <label htmlFor="botDiff">{t('lobby.botLevel')}</label>
                      <select
                        id="botDiff"
                        value={botDifficulty}
                        onChange={(e) => setBotDifficulty(e.target.value)}
                        className="input input-select input-greek"
                      >
                        <option value="easy">{t('lobby.easy')}</option>
                        <option value="medium">{t('lobby.medium')}</option>
                        <option value="hard">{t('lobby.hard')}</option>
                        <option value="extreme">{t('lobby.extreme')}</option>
                        <option value="unfair">{t('lobby.unfair')}</option>
                      </select>
                    </div>
                    <button className="btn btn-olympus btn-create" onClick={createRoom}>
                      {t('lobby.start')}
                    </button>
                    <button className="btn-link lobby-back" onClick={() => setSubView('none')}>
                      {t('lobby.back')}
                    </button>
                  </div>
                )}

                {subView === 'join' && (
                  <div className="lobby-subview">
                    <h3 className="lobby-subview-title">{t('lobby.joinRoom')}</h3>
                    <input
                      type="text"
                      placeholder={t('lobby.roomCode')}
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      maxLength={4}
                      className="input input-greek"
                      style={{ textAlign: 'center', textTransform: 'uppercase' }}
                    />
                    <button className="btn btn-olympus btn-join" onClick={() => joinRoom(roomCode)}>
                      {t('lobby.join')}
                    </button>
                    <button className="btn-link lobby-back" onClick={() => setSubView('none')}>
                      {t('lobby.back')}
                    </button>
                  </div>
                )}

                {subView === 'solo' && (
                  <div className="lobby-subview">
                    <h3 className="lobby-subview-title">{t('lobby.soloGame')}</h3>
                    <div className="target-score-row">
                      <label htmlFor="targetScore">{t('lobby.playTo')}</label>
                      <input
                        id="targetScore"
                        type="number"
                        min={250}
                        step={50}
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        onBlur={() => {
                          const val = parseInt(scoreInput, 10);
                          const clamped = isNaN(val) || val < 250 ? 250 : val;
                          setTargetScore(clamped);
                          setScoreInput(String(clamped));
                        }}
                        className="input input-score input-greek"
                      />
                      <span>{t('lobby.pts')}</span>
                    </div>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="input input-select input-greek"
                    >
                      <option value="easy">{t('lobby.easyBots')}</option>
                      <option value="medium">{t('lobby.mediumBots')}</option>
                      <option value="hard">{t('lobby.hardBots')}</option>
                      <option value="extreme">{t('lobby.extremeBots')}</option>
                      <option value="unfair">{t('lobby.unfairBots')}</option>
                    </select>
                    <button className="btn btn-olympus btn-solo-greek" onClick={() => createSoloRoom(difficulty)}>
                      {t('lobby.start')}
                    </button>
                    <button className="btn-link lobby-back" onClick={() => setSubView('none')}>
                      {t('lobby.back')}
                    </button>
                  </div>
                )}

                {error && <p className="error">{error}</p>}

                <div className="lobby-links">
                  <button className="btn-link lobby-link" onClick={onTutorial}>
                    {t('lobby.howToPlay')}
                  </button>
                  <span className="lobby-link-sep">|</span>
                  <button className="btn-link lobby-link" onClick={onLeaderboard}>
                    {t('lobby.leaderboard')}
                  </button>
                </div>

                {!authUser && guestMode && (
                  <button className="btn-link auth-back-link" onClick={() => setGuestMode(false)}>
                    {t('lobby.signInInstead')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="lobby-footer">
          <MeanderBorder />
          <p className="lobby-updated">Last updated: {new Date(__BUILD_TIME__).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </div>
  );
}
