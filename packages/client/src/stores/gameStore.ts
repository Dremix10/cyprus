import { create } from 'zustand';
import type {
  ClientGameState,
  GameEvent,
  PlayerPosition,
  NormalRank,
} from '@cyprus/shared';
import { socket } from '../socket.js';

interface GameStore {
  gameState: ClientGameState | null;
  selectedCards: Set<string>;
  error: string | null;

  setGameState: (state: ClientGameState) => void;
  handleEvent: (event: GameEvent) => void;

  toggleCard: (cardId: string) => void;
  clearSelection: () => void;

  grandTichuDecision: (call: boolean) => void;
  passCards: (cards: { left: string; across: string; right: string }) => void;
  playCards: () => void;
  passTurn: () => void;
  callTichu: () => void;
  dragonGive: (opponent: PlayerPosition) => void;
  wish: (rank: NormalRank) => void;
  nextRound: () => void;

  setError: (error: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedCards: new Set<string>(),
  error: null,

  setGameState: (state) => set({ gameState: state, error: null }),

  handleEvent: (_event) => {
    // Events can be used for animations/sounds later
    // Game state is updated via the full state broadcast
  },

  toggleCard: (cardId) => {
    const selected = new Set(get().selectedCards);
    if (selected.has(cardId)) {
      selected.delete(cardId);
    } else {
      selected.add(cardId);
    }
    set({ selectedCards: selected });
  },

  clearSelection: () => set({ selectedCards: new Set() }),

  grandTichuDecision: (call) => {
    socket.emit('game:grand_tichu_decision', call);
  },

  passCards: (cards) => {
    socket.emit('game:pass_cards', cards);
    set({ selectedCards: new Set() });
  },

  playCards: () => {
    const { selectedCards } = get();
    if (selectedCards.size === 0) return;
    socket.emit('game:play', [...selectedCards]);
    set({ selectedCards: new Set() });
  },

  passTurn: () => {
    socket.emit('game:pass_turn');
  },

  callTichu: () => {
    socket.emit('game:call_tichu');
  },

  dragonGive: (opponent) => {
    socket.emit('game:dragon_give', opponent);
  },

  wish: (rank) => {
    socket.emit('game:wish', rank);
  },

  nextRound: () => {
    socket.emit('game:next_round');
  },

  setError: (error) => set({ error }),
  reset: () => set({ gameState: null, selectedCards: new Set(), error: null }),
}));
