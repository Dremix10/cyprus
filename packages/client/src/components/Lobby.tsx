import { useState } from 'react';
import { useRoomStore } from '../stores/roomStore.js';

export function Lobby() {
  const [roomCode, setRoomCode] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const nickname = useRoomStore((s) => s.nickname);
  const setNickname = useRoomStore((s) => s.setNickname);
  const targetScore = useRoomStore((s) => s.targetScore);
  const setTargetScore = useRoomStore((s) => s.setTargetScore);
  const createRoom = useRoomStore((s) => s.createRoom);
  const createSoloRoom = useRoomStore((s) => s.createSoloRoom);
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
            className="input input-score"
          />
          <span>pts</span>
        </div>

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

        <div className="divider">
          <span>or</span>
        </div>

        <div className="solo-section">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="input input-select"
          >
            <option value="easy">Easy Bots</option>
            <option value="medium">Medium Bots</option>
            <option value="hard">Hard Bots</option>
          </select>

          <button
            className="btn btn-solo"
            onClick={() => createSoloRoom(difficulty)}
          >
            Solo Game
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
