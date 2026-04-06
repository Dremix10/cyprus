import { useState } from 'react';
import { useRoomStore } from './stores/roomStore.js';
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
  const [showTutorial, setShowTutorial] = useState(false);

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
