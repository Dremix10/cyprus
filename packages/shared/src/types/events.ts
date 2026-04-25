import type { NormalRank } from './card.js';
import type { ClientGameState } from './game.js';
import type { PlayerPosition } from './player.js';
import type { RoomState } from './room.js';

export type GameEventType =
  | 'PLAY'
  | 'PASS'
  | 'BOMB'
  | 'TICHU_CALL'
  | 'GRAND_TICHU_CALL'
  | 'TRICK_WON'
  | 'DRAGON_GIVEN'
  | 'WISH_MADE'
  | 'WISH_FULFILLED'
  | 'PLAYER_OUT'
  | 'ROUND_END'
  | 'GAME_OVER';

export type GameEvent = {
  id?: number; // populated server-side after the event is persisted; lets clients reference it
  type: GameEventType;
  playerPosition?: PlayerPosition;
  data?: Record<string, unknown>;
};

export interface ClientToServerEvents {
  'room:create': (
    nickname: string,
    targetScore: number,
    difficulty: string,
    callback: (response: { roomCode: string; sessionId: string } | { error: string }) => void
  ) => void;
  'room:create_solo': (
    nickname: string,
    targetScore: number,
    difficulty: string,
    callback: (response: { roomCode: string; sessionId: string } | { error: string }) => void
  ) => void;
  'room:join': (
    roomCode: string,
    nickname: string,
    callback: (response: { success: true; sessionId: string } | { error: string }) => void
  ) => void;
  'session:reconnect': (
    sessionId: string,
    callback: (response: { success: true; roomCode: string; nickname: string; hasGame: boolean } | { error: string }) => void
  ) => void;
  'room:sit': (position: PlayerPosition) => void;
  'room:start': () => void;

  'matchmaking:join': (
    nickname: string,
    targetScore: number,
    callback: (response: { success: true } | { error: string }) => void
  ) => void;
  'matchmaking:leave': (
    callback: (response: { success: true } | { error: string }) => void
  ) => void;

  'game:grand_tichu_decision': (call: boolean) => void;
  'game:pass_cards': (cards: {
    left: string;
    across: string;
    right: string;
  }) => void;
  'game:undo_pass': () => void;
  'game:play': (cardIds: string[]) => void;
  'game:pass_turn': () => void;
  'game:call_tichu': () => void;
  'game:dragon_give': (opponentPosition: PlayerPosition) => void;
  'game:wish': (rank: NormalRank) => void;
  'game:next_round': () => void;
  'game:skip_round': () => void;
  'game:resync': () => void;
  'room:spectate': (
    roomCode: string,
    callback: (response: { success: true; roomCode: string } | { error: string }) => void
  ) => void;

  'friend:invite:send': (
    friendUserId: number,
    callback: (response: { success: true } | { error: string }) => void
  ) => void;
  'friend:invite:accept': (
    callback: (response: { success: true; roomCode: string; sessionId: string } | { error: string }) => void
  ) => void;
  'friend:invite:decline': (
    callback: (response: { success: true } | { error: string }) => void
  ) => void;

  'bot:report-play': (
    gameEventId: number,
    callback: (response: { success: true } | { error: string }) => void
  ) => void;

  'game:hint': (
    callback: (response: { play: string[] } | { pass: true } | { error: string }) => void
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'game:state': (state: ClientGameState) => void;
  'game:error': (message: string) => void;
  'game:event': (event: GameEvent) => void;
  'room:player_disconnected': (nickname: string) => void;
  'room:player_reconnected': (nickname: string) => void;

  'matchmaking:update': (data: { playersInQueue: number; elapsed: number }) => void;
  'matchmaking:found': (data: { roomCode: string; sessionId: string }) => void;
  'matchmaking:cancelled': () => void;

  'server:maintenance': (data: { message: string }) => void;

  'friend:invite:received': (data: {
    inviterId: number;
    inviterName: string;
    roomCode: string;
  }) => void;
  'friend:invite:cleared': () => void;
}
