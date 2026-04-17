import { useState, useEffect } from 'react';
import { useRoomStore } from './stores/roomStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useT } from './i18n.js';
import { useSocketEvents } from './hooks/useSocketEvents.js';
import { Lobby } from './components/Lobby.js';
import { WaitingRoom } from './components/WaitingRoom.js';
import { GameBoard } from './components/GameBoard.js';
import { MatchmakingQueue } from './components/MatchmakingQueue.js';
import { Tutorial } from './components/Tutorial.js';
import { Leaderboard } from './components/Leaderboard.js';
import { Profile } from './components/Profile.js';
import { ConnectionStatus } from './components/ConnectionStatus.js';
import { ResetPasswordForm } from './components/AuthForms.js';
import { LiveGames } from './components/LiveGames.js';
import './App.css';

function getResetToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('resetToken');
}

export default function App() {
  useSocketEvents();
  const view = useRoomStore((s) => s.view);
  const reconnecting = useRoomStore((s) => s.reconnecting);
  const trySessionReconnect = useRoomStore((s) => s.trySessionReconnect);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLiveGames, setShowLiveGames] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(getResetToken);

  // Check auth and attempt session reconnect on mount
  useEffect(() => {
    // Clean up auth/error query params from Google OAuth redirect
    const params = new URLSearchParams(window.location.search);
    if (params.has('authSuccess') || params.has('error')) {
      window.history.replaceState({}, '', '/');
    }
    checkAuth();
    trySessionReconnect();
  }, []);

  const t = useT();

  if (reconnecting) {
    return (
      <div className="app">
        <div className="reconnecting-screen">
          <p>{t('app.reconnecting')}</p>
        </div>
      </div>
    );
  }

  if (resetToken) {
    return (
      <div className="app">
        <div className="lobby-fullscreen">
          <div className="lobby-bg-clouds" />
          <div className="lobby-bg-zeus" />
          <div className="lobby-bg-overlay" />
          <div className="lobby-content">
            <div className="lobby-header">
              <h1 className="title-greek">TICHU</h1>
            </div>
            <div className="lobby-form-card">
              <div className="lobby-form">
                <ResetPasswordForm token={resetToken} onDone={() => { setResetToken(null); window.history.replaceState({}, '', '/'); }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showTutorial) {
    return (
      <div className="app">
        <Tutorial onBack={() => setShowTutorial(false)} />
      </div>
    );
  }

  if (showLeaderboard) {
    return (
      <div className="app">
        <Leaderboard onBack={() => setShowLeaderboard(false)} />
      </div>
    );
  }

  if (showProfile) {
    return (
      <div className="app">
        <Profile onBack={() => setShowProfile(false)} />
      </div>
    );
  }

  if (showLiveGames) {
    return (
      <div className="app">
        <LiveGames onBack={() => setShowLiveGames(false)} />
      </div>
    );
  }

  return (
    <div className="app">
      <ConnectionStatus />
      {view === 'lobby' && <Lobby onTutorial={() => setShowTutorial(true)} onLeaderboard={() => setShowLeaderboard(true)} onProfile={() => setShowProfile(true)} onLiveGames={() => setShowLiveGames(true)} />}
      {view === 'queue' && <MatchmakingQueue />}
      {view === 'waiting' && <WaitingRoom />}
      {view === 'game' && <GameBoard />}
    </div>
  );
}
