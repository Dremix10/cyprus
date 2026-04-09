import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { AuthForms, UserBadge } from './AuthForms.js';

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

export function Lobby({ onTutorial }: { onTutorial: () => void }) {
  const [roomCode, setRoomCode] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [guestMode, setGuestMode] = useState(false);
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const targetScore = useRoomStore((s) => s.targetScore);
  const setTargetScore = useRoomStore((s) => s.setTargetScore);
  const createRoom = useRoomStore((s) => s.createRoom);
  const createSoloRoom = useRoomStore((s) => s.createSoloRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const error = useRoomStore((s) => s.error);

  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);

  // Auto-fill nickname from auth displayName
  const effectiveNickname = authUser ? authUser.displayName : nickname;
  const showGameForm = authUser || guestMode;

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
          <h1 className="title-greek">TICHU</h1>
          <p className="subtitle-greek">Online Card Game</p>
          <MeanderBorder />
        </div>

        <div className="lobby-form-card">
          {authUser && <UserBadge />}
          <div className="lobby-form">
            {authLoading ? (
              <p className="auth-loading">Loading...</p>
            ) : !showGameForm ? (
              <AuthForms onGuest={() => setGuestMode(true)} />
            ) : (
              <>
                {!authUser && (
                  <input
                    type="text"
                    placeholder="Enter your name, mortal"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={16}
                    className="input input-greek"
                  />
                )}

                {authUser && (
                  <p className="auth-playing-as">
                    Playing as <strong>{authUser.displayName}</strong>
                  </p>
                )}

                <div className="target-score-row">
                  <label htmlFor="targetScore">Play to</label>
                  <input
                    id="targetScore"
                    type="number"
                    min={250}
                    step={50}
                    value={targetScore}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setTargetScore(Math.max(250, val));
                    }}
                    className="input input-score input-greek"
                  />
                  <span>pts</span>
                </div>

                <button
                  className="btn btn-olympus btn-create"
                  onClick={() => {
                    if (authUser) setNickname(authUser.displayName);
                    createRoom();
                  }}
                >
                  Create Room
                </button>

                <div className="divider divider-greek">
                  <span>or</span>
                </div>

                <input
                  type="text"
                  placeholder="Room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="input input-greek"
                />

                <button
                  className="btn btn-olympus btn-join"
                  onClick={() => {
                    if (authUser) setNickname(authUser.displayName);
                    joinRoom(roomCode);
                  }}
                >
                  Join Room
                </button>

                <div className="divider divider-greek">
                  <span>or</span>
                </div>

                <div className="solo-section">
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="input input-select input-greek"
                  >
                    <option value="easy">Easy Bots</option>
                    <option value="medium">Medium Bots</option>
                    <option value="hard">Hard Bots</option>
                  </select>

                  <button
                    className="btn btn-olympus btn-solo-greek"
                    onClick={() => {
                      if (authUser) setNickname(authUser.displayName);
                      createSoloRoom(difficulty);
                    }}
                  >
                    Solo Game
                  </button>
                </div>

                {error && <p className="error">{error}</p>}

                <button className="btn btn-olympus btn-tutorial" onClick={onTutorial}>
                  How to Play
                </button>

                {!authUser && guestMode && (
                  <button className="btn-link auth-back-link" onClick={() => setGuestMode(false)}>
                    Sign in instead
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
