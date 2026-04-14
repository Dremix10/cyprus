import { useEffect } from 'react';
import { socket } from '../socket.js';
import { useRoomStore } from '../stores/roomStore.js';
import { useGameStore } from '../stores/gameStore.js';

export function useSocketEvents() {
  const setRoomState = useRoomStore((s) => s.setRoomState);
  const setView = useRoomStore((s) => s.setView);
  const setGameState = useGameStore((s) => s.setGameState);
  const handleEvent = useGameStore((s) => s.handleEvent);
  const setGameError = useGameStore((s) => s.setError);
  const setRoomError = useRoomStore((s) => s.setError);
  const setQueueInfo = useRoomStore((s) => s.setQueueInfo);

  useEffect(() => {
    const onRoomState = (state: Parameters<typeof setRoomState>[0]) => {
      setRoomState(state);
    };

    const onGameState = (state: Parameters<typeof setGameState>[0]) => {
      setGameState(state);
      setView('game');
    };

    const onGameEvent = (event: Parameters<typeof handleEvent>[0]) => {
      handleEvent(event);
    };

    const onGameError = (message: string) => {
      // If we get "No active game", try to reconnect the session
      if (message === 'No active game') {
        const { trySessionReconnect } = useRoomStore.getState();
        trySessionReconnect();
        return;
      }
      setGameError(message);
    };

    const onPlayerDisconnected = (nickname: string) => {
      setRoomError(`${nickname} disconnected`);
    };

    const onPlayerReconnected = (nickname: string) => {
      setRoomError(`${nickname} reconnected`);
      setTimeout(() => setRoomError(null), 3000);
    };

    const onMatchmakingUpdate = (data: { playersInQueue: number; elapsed: number }) => {
      setQueueInfo(data);
    };

    const onMatchmakingFound = (data: { roomCode: string; sessionId: string }) => {
      useRoomStore.getState().handleMatchFound(data.roomCode, data.sessionId);
    };

    const onMatchmakingCancelled = () => {
      useRoomStore.setState({ view: 'lobby', queueInfo: null });
    };

    // On socket reconnect, try to rejoin via session
    const onReconnect = () => {
      const { trySessionReconnect } = useRoomStore.getState();
      trySessionReconnect();
    };

    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);
    socket.on('game:event', onGameEvent);
    socket.on('game:error', onGameError);
    socket.on('room:player_disconnected', onPlayerDisconnected);
    socket.on('room:player_reconnected', onPlayerReconnected);
    socket.on('matchmaking:update', onMatchmakingUpdate);
    socket.on('matchmaking:found', onMatchmakingFound);
    socket.on('matchmaking:cancelled', onMatchmakingCancelled);
    socket.io.on('reconnect', onReconnect);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
      socket.off('game:event', onGameEvent);
      socket.off('game:error', onGameError);
      socket.off('room:player_disconnected', onPlayerDisconnected);
      socket.off('room:player_reconnected', onPlayerReconnected);
      socket.off('matchmaking:update', onMatchmakingUpdate);
      socket.off('matchmaking:found', onMatchmakingFound);
      socket.off('matchmaking:cancelled', onMatchmakingCancelled);
      socket.io.off('reconnect', onReconnect);
    };
  }, [setRoomState, setView, setGameState, handleEvent, setGameError, setRoomError, setQueueInfo]);
}
