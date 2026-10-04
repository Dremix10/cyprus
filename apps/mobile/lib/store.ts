import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import type { ClientGameState, GameEvent, NormalRank, PlayerPosition, RoomState } from '@cyprus/shared';
import { socket } from './socket';
import { clearTicket, loadProfile, loadTicket, saveProfile, saveTicket } from './session';

export type Conn = 'connecting' | 'connected' | 'reconnecting';
export type View = 'lobby' | 'waiting' | 'game';

type Notice = { id: number; text: string; tone: 'info' | 'warn' | 'error' };

interface AppStore {
  conn: Conn;
  ready: boolean; // profile loaded + first reconnect attempt finished
  view: View;
  busy: boolean;
  nickname: string;
  targetScore: number;
  difficulty: string;
  roomCode: string | null;
  roomState: RoomState | null;
  game: ClientGameState | null;
  lastEvent: GameEvent | null;
  selected: string[]; // card ids picked in the hand
  notice: Notice | null;
  maintenance: string | null;

  setNickname(v: string): void;
  setTargetScore(v: number): void;
  setDifficulty(v: string): void;
  notify(text: string, tone?: Notice['tone']): void;
  dismissNotice(): void;

  createSolo(): Promise<void>;
  createRoom(): Promise<void>;
  joinRoom(code: string): Promise<void>;
  sit(pos: PlayerPosition): void;
  start(): void;
  leave(): Promise<void>;

  toggleCard(id: string): void;
  clearSelection(): void;
  grandTichu(call: boolean): void;
  passCards(c: { left: string; across: string; right: string }): void;
  undoPass(): void;
  play(): void;
  passTurn(): void;
  callTichu(): void;
  dragonGive(p: PlayerPosition): void;
  wish(rank: NormalRank): void;
  nextRound(): void;
  skipRound(): void;
  resync(): void;
}

let noticeSeq = 0;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let reconnecting = false;

const PERMANENT = ['Session expired', 'Room no longer exists', 'Session invalid', 'You were replaced by a bot'];

export const useApp = create<AppStore>((set, get) => {
  const notify = (text: string, tone: Notice['tone'] = 'info') => {
    if (noticeTimer) clearTimeout(noticeTimer);
    const id = ++noticeSeq;
    set({ notice: { id, text, tone } });
    noticeTimer = setTimeout(() => {
      if (get().notice?.id === id) set({ notice: null });
    }, tone === 'error' ? 3500 : 2500);
  };

  /** Wait for the socket, up to 5 s. */
  const ensureConnected = (): Promise<void> => {
    if (socket.connected) return Promise.resolve();
    socket.connect();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('connect', onConnect);
        reject(new Error('timeout'));
      }, 5000);
      const onConnect = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.once('connect', onConnect);
    });
  };

  const emitAction = <T extends (...a: never[]) => void>(fn: T) => {
    if (!socket.connected) {
      notify('Not connected. Reconnecting…', 'warn');
      return;
    }
    fn();
  };

  /** Create/join flow shared by solo, create and join. */
  const enterRoom = async (
    run: (cb: (res: { roomCode?: string; sessionId?: string; success?: true; error?: string }) => void) => void,
    fallbackCode: string | null,
    nextView: View | null,
  ) => {
    const { nickname } = get();
    if (!nickname.trim()) return notify('Enter a nickname', 'error');
    set({ busy: true });
    try {
      await ensureConnected();
    } catch {
      set({ busy: false });
      return notify('Could not reach the server. Try again.', 'error');
    }
    await saveProfile({ nickname: nickname.trim(), targetScore: get().targetScore, difficulty: get().difficulty });
    run((res) => {
      set({ busy: false });
      if (res.error || !res.sessionId) return notify(res.error ?? 'Something went wrong', 'error');
      const code = res.roomCode ?? fallbackCode ?? '';
      void saveTicket(res.sessionId, code, nickname.trim());
      set({ roomCode: code, roomState: null, game: null, selected: [], ...(nextView ? { view: nextView } : {}) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  };

  /** Re-attach to the table with the stored table ticket. */
  const tryReconnect = async (): Promise<boolean> => {
    if (reconnecting) return false;
    const ticket = await loadTicket();
    if (!ticket) return false;
    reconnecting = true;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reconnecting = false;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 12000);
      socket.emit('session:reconnect', ticket.sessionId, (res) => {
        if ('error' in res) {
          if (PERMANENT.some((m) => res.error.includes(m))) {
            void clearTicket();
            set({ view: 'lobby', roomCode: null, roomState: null, game: null });
            notify(res.error, 'warn');
          }
          return finish(false);
        }
        set({
          nickname: ticket.nickname,
          roomCode: res.roomCode,
          view: res.hasGame ? 'game' : 'waiting',
        });
        finish(true);
      });
    });
  };

  // ── socket wiring (once) ──────────────────────────────────────────
  socket.on('connect', () => {
    set({ conn: 'connected' });
    void tryReconnect().finally(() => set({ ready: true }));
  });
  socket.on('disconnect', () => set({ conn: 'reconnecting' }));
  socket.on('connect_error', () => set((s) => (s.ready ? { conn: 'reconnecting' } : {})));
  socket.io.on('reconnect_attempt', () => set({ conn: 'reconnecting' }));

  socket.on('room:state', (roomState) => set({ roomState }));
  socket.on('game:state', (game) => {
    const prev = get().game;
    const myTurnNow =
      game.phase === 'PLAYING' &&
      game.currentPlayer === game.myPosition &&
      (!prev || prev.currentPlayer !== game.myPosition || prev.phase !== 'PLAYING');
    if (myTurnNow) void Haptics.selectionAsync().catch(() => {});
    // Drop selected ids that are no longer in my hand.
    const ids = new Set(game.myHand.map((c) => c.id));
    set((s) => ({ game, view: 'game', selected: s.selected.filter((id) => ids.has(id)) }));
  });
  socket.on('game:event', (e) => {
    set({ lastEvent: e });
    const h = Haptics;
    switch (e.type) {
      case 'PLAY':
        void h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      case 'PASS':
        void h.selectionAsync().catch(() => {});
        break;
      case 'BOMB':
        void h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => {});
        break;
      case 'TRICK_WON':
        void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {});
        break;
      case 'TICHU_CALL':
      case 'GRAND_TICHU_CALL':
        void h.impactAsync(h.ImpactFeedbackStyle.Heavy).catch(() => {});
        break;
    }
  });
  socket.on('game:error', (message) => {
    if (message === 'No active game') {
      void tryReconnect();
      return;
    }
    notify(message, 'error');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    // "Slow down" is not a stale board. Asking again just makes more of them.
    if (message === 'Too many requests, slow down') return;
    if (socket.connected && get().game) socket.emit('game:resync');
  });
  socket.on('room:player_disconnected', (n) => notify(`${n} disconnected`, 'warn'));
  socket.on('room:player_reconnected', (n) => notify(`${n} reconnected`));
  socket.on('server:maintenance', (d) => set({ maintenance: d.message }));
  socket.io.on('reconnect', () => set({ maintenance: null }));

  // Periodic resync like the website: recover from any missed update.
  setInterval(() => {
    if (socket.connected && get().game) socket.emit('game:resync');
  }, 15000);

  // Never trap the user on the boot spinner if the server is slow or unreachable.
  setTimeout(() => set({ ready: true }), 4000);

  // Profile (nickname etc.) from storage.
  void loadProfile().then((p) =>
    set((s) => ({
      nickname: p.nickname ?? s.nickname,
      targetScore: p.targetScore ?? s.targetScore,
      difficulty: p.difficulty ?? s.difficulty,
    })),
  );

  return {
    conn: 'connecting',
    ready: false,
    view: 'lobby',
    busy: false,
    nickname: '',
    targetScore: 1000,
    difficulty: 'medium',
    roomCode: null,
    roomState: null,
    game: null,
    lastEvent: null,
    selected: [],
    notice: null,
    maintenance: null,

    setNickname: (nickname) => set({ nickname: nickname.slice(0, 20) }),
    setTargetScore: (targetScore) => set({ targetScore }),
    setDifficulty: (difficulty) => set({ difficulty }),
    notify,
    dismissNotice: () => set({ notice: null }),

    createSolo: () =>
      enterRoom(
        (cb) => socket.emit('room:create_solo', get().nickname.trim(), get().targetScore, get().difficulty, cb),
        null,
        null, // game:state flips the view
      ),
    createRoom: () =>
      enterRoom(
        (cb) => socket.emit('room:create', get().nickname.trim(), get().targetScore, get().difficulty, cb),
        null,
        'waiting',
      ),
    joinRoom: (code) => {
      const c = code.trim().toUpperCase();
      if (!c) {
        notify('Enter a room code', 'error');
        return Promise.resolve();
      }
      return enterRoom((cb) => socket.emit('room:join', c, get().nickname.trim(), cb), c, 'waiting');
    },
    sit: (pos) => emitAction(() => socket.emit('room:sit', pos)),
    start: () => emitAction(() => socket.emit('room:start')),
    leave: async () => {
      await clearTicket();
      set({ view: 'lobby', roomCode: null, roomState: null, game: null, selected: [], lastEvent: null });
      // Dropping the connection is how the server learns we left; then come straight back.
      socket.disconnect();
      socket.connect();
    },

    toggleCard: (id) =>
      set((s) => ({ selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id] })),
    clearSelection: () => set({ selected: [] }),
    grandTichu: (call) => emitAction(() => socket.emit('game:grand_tichu_decision', call)),
    passCards: (c) => {
      emitAction(() => socket.emit('game:pass_cards', c));
      set({ selected: [] });
    },
    undoPass: () => emitAction(() => socket.emit('game:undo_pass')),
    play: () => {
      const { selected } = get();
      if (selected.length === 0) return;
      emitAction(() => socket.emit('game:play', selected));
      set({ selected: [] });
    },
    passTurn: () => emitAction(() => socket.emit('game:pass_turn')),
    callTichu: () => emitAction(() => socket.emit('game:call_tichu')),
    dragonGive: (p) => emitAction(() => socket.emit('game:dragon_give', p)),
    wish: (rank) => emitAction(() => socket.emit('game:wish', rank)),
    nextRound: () => emitAction(() => socket.emit('game:next_round')),
    skipRound: () => emitAction(() => socket.emit('game:skip_round')),
    resync: () => {
      if (socket.connected) socket.emit('game:resync');
    },
  };
});
