import { useRoomStore } from './stores/roomStore.js';
import { useSocketEvents } from './hooks/useSocketEvents.js';
import { Lobby } from './components/Lobby.js';
import { WaitingRoom } from './components/WaitingRoom.js';
import { GameBoard } from './components/GameBoard.js';
import { ConnectionStatus } from './components/ConnectionStatus.js';
import './App.css';

export default function App() {
  useSocketEvents();
  const view = useRoomStore((s) => s.view);

  return (
    <div className="app">
      <ConnectionStatus />
      {view === 'lobby' && <Lobby />}
      {view === 'waiting' && <WaitingRoom />}
      {view === 'game' && <GameBoard />}
    </div>
  );
}
