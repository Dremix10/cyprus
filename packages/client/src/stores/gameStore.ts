import { create } from 'zustand';
import type {
  ClientGameState,
  GameEvent,
  PlayerPosition,
  NormalRank,
} from '@cyprus/shared';
import { socket } from '../socket.js';
import {
  playCardSound,
  playPassSound,
  playBombSound,
  playTichuCallSound,
  playTrickWonSound,
  playPlayerOutSound,
  playDragonGiveSound,
  playWishSound,
  playRoundEndSound,
  playYourTurnSound,
} from '../sounds.js';

export interface ReportableBotPlay {
  eventId: number;
  position: PlayerPosition;
  type: 'PLAY' | 'PASS' | 'BOMB';
  // Display-only summary; full card data is in event.data.combination
  combinationSummary: string;
  branchTag: string | null;
  tier: string | null;
  at: number;
  reportStatus: 'idle' | 'sending' | 'reported' | 'error';
  errorMessage?: string;
}

export type HintStatus = 'idle' | 'loading' | 'used' | 'error';

interface GameStore {
  gameState: ClientGameState | null;
  selectedCards: Set<string>;
  error: string | null;
  lastEvent: GameEvent | null;
  /** Bot plays from the current round that the user could flag as bad. Capped, FIFO. */
  reportableBotPlays: ReportableBotPlay[];
  /** Hint UI state — resets each time it becomes the user's turn. */
  hintStatus: HintStatus;
  hintError: string | null;
  /** Recommended pass message to show after a hint resolves to "pass". Cleared on next turn. */
  hintRecommendedPass: boolean;

  setGameState: (state: ClientGameState) => void;
  handleEvent: (event: GameEvent) => void;
  reportBotPlay: (eventId: number) => Promise<void>;
  requestHint: () => Promise<void>;

  toggleCard: (cardId: string) => void;
  setSelectedCards: (cards: Set<string>) => void;
  clearSelection: () => void;

  grandTichuDecision: (call: boolean) => void;
  passCards: (cards: { left: string; across: string; right: string }) => void;
  undoPassCards: () => void;
  playCards: () => void;
  passTurn: () => void;
  callTichu: () => void;
  dragonGive: (opponent: PlayerPosition) => void;
  wish: (rank: NormalRank) => void;
  nextRound: () => void;
  skipRound: () => void;

  setError: (error: string | null) => void;
  reset: () => void;
}

function summarizeBotPlay(event: GameEvent): string {
  if (event.type === 'PASS') return 'pass';
  const combo = (event.data as { combination?: { type?: string; cards?: Array<{ id?: string }> } } | undefined)?.combination;
  if (!combo || !combo.cards) return event.type.toLowerCase();
  const ids = combo.cards.map((c) => c.id ?? '?');
  return `${combo.type ?? '?'} [${ids.join(', ')}]`;
}

const MAX_REPORTABLE = 25;

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedCards: new Set<string>(),
  error: null,
  lastEvent: null,
  reportableBotPlays: [],
  hintStatus: 'idle',
  hintError: null,
  hintRecommendedPass: false,

  setGameState: (state) => {
    const prev = get().gameState;
    // Detect turn-becomes-mine transition: play sound + reset hint state.
    const myTurnNow =
      state.phase === 'PLAYING' &&
      state.currentPlayer === state.myPosition &&
      (!prev || prev.currentPlayer !== state.myPosition || prev.phase !== 'PLAYING');
    if (myTurnNow) {
      playYourTurnSound();
      set({ hintStatus: 'idle', hintError: null, hintRecommendedPass: false });
    }
    set({ gameState: state, error: null });
  },

  handleEvent: (event) => {
    set({ lastEvent: event });

    // Track bot PLAY/PASS/BOMB events as reportable (only if event has the bot decision context)
    if (event.id !== undefined && (event.type === 'PLAY' || event.type === 'PASS' || event.type === 'BOMB')) {
      const data = event.data as { bot?: { branchTag?: string | null; tier?: string | null } } | undefined;
      if (data?.bot && event.playerPosition !== undefined) {
        const entry: ReportableBotPlay = {
          eventId: event.id,
          position: event.playerPosition,
          type: event.type,
          combinationSummary: summarizeBotPlay(event),
          branchTag: data.bot.branchTag ?? null,
          tier: data.bot.tier ?? null,
          at: Date.now(),
          reportStatus: 'idle',
        };
        const next = [entry, ...get().reportableBotPlays].slice(0, MAX_REPORTABLE);
        set({ reportableBotPlays: next });
      }
    }
    // New round / game over: reset the reportable list
    if (event.type === 'ROUND_END' || event.type === 'GAME_OVER') {
      set({ reportableBotPlays: [] });
    }

    switch (event.type) {
      case 'PLAY':
        playCardSound();
        break;
      case 'BOMB':
        playBombSound();
        break;
      case 'PASS':
        playPassSound();
        break;
      case 'TICHU_CALL':
      case 'GRAND_TICHU_CALL':
        playTichuCallSound();
        break;
      case 'TRICK_WON':
        playTrickWonSound();
        break;
      case 'PLAYER_OUT':
        playPlayerOutSound();
        break;
      case 'DRAGON_GIVEN':
        playDragonGiveSound();
        break;
      case 'WISH_MADE':
        playWishSound();
        break;
      case 'ROUND_END':
      case 'GAME_OVER':
        playRoundEndSound();
        break;
    }
  },

  reportBotPlay: (eventId) =>
    new Promise<void>((resolve) => {
      const updateStatus = (status: ReportableBotPlay['reportStatus'], errorMessage?: string) => {
        set((state) => ({
          reportableBotPlays: state.reportableBotPlays.map((p) =>
            p.eventId === eventId ? { ...p, reportStatus: status, errorMessage } : p,
          ),
        }));
      };
      updateStatus('sending');
      socket.emit('bot:report-play', eventId, (response) => {
        if ('error' in response) {
          updateStatus('error', response.error);
        } else {
          updateStatus('reported');
        }
        resolve();
      });
    }),

  requestHint: () =>
    new Promise<void>((resolve) => {
      const { hintStatus } = get();
      if (hintStatus === 'loading' || hintStatus === 'used') {
        resolve();
        return;
      }
      set({ hintStatus: 'loading', hintError: null, hintRecommendedPass: false });
      socket.emit('game:hint', (response) => {
        if ('error' in response) {
          set({ hintStatus: 'error', hintError: response.error });
        } else if ('pass' in response) {
          set({ hintStatus: 'used', hintRecommendedPass: true, selectedCards: new Set() });
        } else {
          // Auto-select the recommended cards (option (a)).
          set({ hintStatus: 'used', hintRecommendedPass: false, selectedCards: new Set(response.play) });
        }
        resolve();
      });
    }),

  toggleCard: (() => {
    let lastToggleTime = 0;
    let lastToggleId = '';
    return (cardId: string) => {
      const now = Date.now();
      // Debounce: ignore if same card toggled within 100ms (prevents touch double-fire)
      if (cardId === lastToggleId && now - lastToggleTime < 100) return;
      lastToggleTime = now;
      lastToggleId = cardId;

      const selected = new Set(get().selectedCards);
      if (selected.has(cardId)) {
        selected.delete(cardId);
      } else {
        selected.add(cardId);
      }
      set({ selectedCards: selected });
    };
  })(),

  setSelectedCards: (cards) => set({ selectedCards: cards }),
  clearSelection: () => set({ selectedCards: new Set() }),

  grandTichuDecision: (call) => {
    socket.emit('game:grand_tichu_decision', call);
  },

  passCards: (cards) => {
    socket.emit('game:pass_cards', cards);
    set({ selectedCards: new Set() });
  },

  undoPassCards: () => {
    socket.emit('game:undo_pass');
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

  skipRound: () => {
    socket.emit('game:skip_round');
  },

  setError: (error) => set({ error }),
  reset: () => set({
    gameState: null,
    selectedCards: new Set(),
    error: null,
    lastEvent: null,
    reportableBotPlays: [],
    hintStatus: 'idle',
    hintError: null,
    hintRecommendedPass: false,
  }),
}));
