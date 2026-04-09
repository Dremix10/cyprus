import { useState, useEffect } from 'react';
import { useRoomStore } from './stores/roomStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useSocketEvents } from './hooks/useSocketEvents.js';
import { Lobby } from './components/Lobby.js';
import { WaitingRoom } from './components/WaitingRoom.js';
import { GameBoard } from './components/GameBoard.js';
import { Tutorial } from './components/Tutorial.js';
import { ConnectionStatus } from './components/ConnectionStatus.js';
import './App.css';

export default function App() {
  useSocketEvents();
  const view = useRoomStore((s) => s.view);
  const reconnecting = useRoomStore((s) => s.reconnecting);
  const trySessionReconnect = useRoomStore((s) => s.trySessionReconnect);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [showTutorial, setShowTutorial] = useState(false);

  // Check auth and attempt session reconnect on mount
  useEffect(() => {
    checkAuth();
    trySessionReconnect();
  }, []);

  if (reconnecting) {
    return (
      <div className="app">
        <div className="reconnecting-screen">
          <p>Reconnecting to game...</p>
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

  return (
    <div className="app">
      <ConnectionStatus />
      {view === 'lobby' && <Lobby onTutorial={() => setShowTutorial(true)} />}
      {view === 'waiting' && <WaitingRoom />}
      {view === 'game' && <GameBoard />}
    </div>
  );
}
