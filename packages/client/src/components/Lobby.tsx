import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';

export function Lobby() {
  const [roomCode, setRoomCode] = useState('');
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const createRoom = useRoomStore((s) => s.createRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const error = useRoomStore((s) => s.error);

  return (
    <div className="lobby">
      <h1>Cyprus</h1>
      <p className="subtitle">Tichu Online</p>

      <div className="lobby-form">
        <input
          type="text"
          placeholder="Your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          className="input"
        />

        <button className="btn btn-primary" onClick={createRoom}>
          Create Room
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <input
          type="text"
          placeholder="Room code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="input"
        />

        <button
          className="btn btn-secondary"
          onClick={() => joinRoom(roomCode)}
        >
          Join Room
        </button>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
