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
  type: GameEventType;
  playerPosition?: PlayerPosition;
  data?: Record<string, unknown>;
};

export interface ClientToServerEvents {
  'room:create': (
    nickname: string,
    callback: (response: { roomCode: string } | { error: string }) => void
  ) => void;
  'room:join': (
    roomCode: string,
    nickname: string,
    callback: (response: { success: true } | { error: string }) => void
  ) => void;
  'room:sit': (position: PlayerPosition) => void;
  'room:start': () => void;

  'game:grand_tichu_decision': (call: boolean) => void;
  'game:pass_cards': (cards: {
    left: string;
    across: string;
    right: string;
  }) => void;
  'game:play': (cardIds: string[]) => void;
  'game:pass_turn': () => void;
  'game:call_tichu': () => void;
  'game:dragon_give': (opponentPosition: PlayerPosition) => void;
  'game:wish': (rank: NormalRank) => void;
  'game:next_round': () => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'game:state': (state: ClientGameState) => void;
  'game:error': (message: string) => void;
  'game:event': (event: GameEvent) => void;
  'room:player_disconnected': (nickname: string) => void;
  'room:player_reconnected': (nickname: string) => void;
}
