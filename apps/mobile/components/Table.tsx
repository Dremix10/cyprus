import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GamePhase,
  getRankLabel,
  sortCards,
  type Card,
  type ClientGameState,
  type PlayerPosition,
  type PublicPlayerState,
} from '@cyprus/shared';
import { Btn } from './Btn';
import { CardView, CardBack } from './CardView';
import { GlassSurface } from './GlassSurface';
import { Hand } from './Hand';
import { Felt } from './Felt';
import {
  DragonSheet,
  GameOverView,
  GrandTichuView,
  PassingView,
  ScoringView,
  WishSheet,
  confirmTichu,
} from './PhaseViews';
import { ScoreHistorySheet } from './MoreScreens';
import { color, greekFont, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';
import { socket } from '@/lib/socket';

function useCountdown(deadline?: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export function Table() {
  const g = useApp((s) => s.game);
  if (!g) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.text} />
        <Text style={styles.dim}>Loading the table…</Text>
      </View>
    );
  }
  switch (g.phase) {
    case GamePhase.GRAND_TICHU:
      return <GrandTichuView g={g} />;
    case GamePhase.PASSING:
      return <PassingView g={g} />;
    case GamePhase.ROUND_SCORING:
      return <ScoringView g={g} />;
    case GamePhase.GAME_OVER:
      return <GameOverView g={g} />;
    case GamePhase.PLAYING:
    case GamePhase.DRAGON_GIVE:
      return <Playing g={g} />;
    default:
      return (
        <View style={styles.center}>
          <ActivityIndicator color={color.text} />
          <Text style={styles.dim}>Dealing…</Text>
        </View>
      );
  }
}

function OpponentTile({ p, g, compact }: { p: PublicPlayerState; g: ClientGameState; compact?: boolean }) {
  const mate = p.position % 2 === g.myPosition % 2;
  const turn = g.currentPlayer === p.position && g.phase === GamePhase.PLAYING;
  const passed = g.currentTrick.passedPlayers?.includes(p.position);
  const dc = useCountdown(g.disconnectDeadlines?.[p.position]);
  return (
    <View style={[styles.tile, compact && styles.tileCompact, turn && styles.tileTurn, p.isOut && { opacity: 0.6 }]}>
      <Text
        style={[styles.tileName, compact && styles.tileNameCompact, { color: mate ? color.teamUs : color.teamThem }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        accessibilityLabel={p.nickname}
      >
        {p.isBot ? p.nickname.replace(/^Bot /, '') : p.nickname}
      </Text>
      <View style={styles.tileRow}>
        {p.isOut ? (
          <Text style={styles.tileBadge}>OUT #{p.finishOrder}</Text>
        ) : (
          <>
            <CardBack width={16} />
            <Text style={styles.tileCount}>{p.cardCount}</Text>
          </>
        )}
      </View>
      {p.tichuCall !== 'none' && (
        <Text style={[styles.tichuBadge, p.tichuCall === 'grand_tichu' && { backgroundColor: color.danger }]}>
          {p.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
        </Text>
      )}
      {passed && !p.isOut && <Text style={styles.passChip}>passed</Text>}
      {dc !== null && p.connected === false && <Text style={styles.dcChip}>bot in {dc}s</Text>}
    </View>
  );
}

function CardRow({ cards, width }: { cards: Card[]; width: number }) {
  const n = cards.length;
  const overlap = n > 6 ? Math.round(width * 0.45) : n > 3 ? Math.round(width * 0.2) : 4;
  return (
    <View style={{ flexDirection: 'row' }}>
      {cards.map((c, i) => (
        <View key={c.id} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          <CardView card={c} width={width} />
        </View>
      ))}
    </View>
  );
}

function Playing({ g }: { g: ClientGameState }) {
  const insets = useSafeAreaInsets();
  const selected = useApp((s) => s.selected);
  const toggle = useApp((s) => s.toggleCard);
  const clearSel = useApp((s) => s.clearSelection);
  const play = useApp((s) => s.play);
  const passTurn = useApp((s) => s.passTurn);
  const callTichu = useApp((s) => s.callTichu);
  const leave = useApp((s) => s.leave);
  const notify = useApp((s) => s.notify);
  const lastEvent = useApp((s) => s.lastEvent);
  const roomCode = useApp((s) => s.roomCode);
  const [hinting, setHinting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const soundOn = useApp((s) => s.soundOn);
  const toggleSound = useApp((s) => s.toggleSound);
  const reportBot = useApp((s) => s.reportBot);

  const me = g.players[g.myPosition];
  const myTeam = (g.myPosition % 2) as 0 | 1;
  const rel = {
    right: ((g.myPosition + 1) % 4) as PlayerPosition,
    top: ((g.myPosition + 2) % 4) as PlayerPosition,
    left: ((g.myPosition + 3) % 4) as PlayerPosition,
  };
  const isDragon = g.phase === GamePhase.DRAGON_GIVE;
  const myTurn = g.currentPlayer === g.myPosition && !isDragon;
  const canAct = g.canAct ?? true;
  const canPass = g.canPass ?? false;
  const mustPlayWish = g.mustPlayWish ?? false;
  const secs = useCountdown(g.turnDeadline);
  const turnName = g.players[g.currentPlayer]?.nickname ?? '';
  const dragonMine = isDragon && g.currentTrick.currentWinner === g.myPosition;
  const wishMine = g.wishPending === g.myPosition;
  const hand = sortCards(g.myHand);

  // Event-driven toasts (animation/sound cues only; the snapshot is the truth).
  useEffect(() => {
    if (!lastEvent) return;
    const name = lastEvent.playerPosition !== undefined ? g.players[lastEvent.playerPosition]?.nickname : undefined;
    if (lastEvent.type === 'BOMB') notify(`${name ?? 'Someone'} played a bomb!`, 'warn');
    else if (lastEvent.type === 'TICHU_CALL') notify(`${name ?? 'Someone'} called Tichu`, 'warn');
    else if (lastEvent.type === 'GRAND_TICHU_CALL') notify(`${name ?? 'Someone'} called Grand Tichu`, 'warn');
    else if (lastEvent.type === 'PLAYER_OUT') notify(`${name ?? 'Someone'} is out`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  const confirmLeave = () =>
    Alert.alert('Leave this game?', 'A bot will take your seat.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: leave },
    ]);

  const hint = () => {
    if (hinting || !socket.connected) return;
    setHinting(true);
    socket.emit('game:hint', (res) => {
      setHinting(false);
      if ('error' in res) notify(res.error, 'error');
      else if ('pass' in res) {
        clearSel();
        notify('Hint: pass');
      } else useApp.setState({ selected: res.play });
    });
  };

  const trick = g.currentTrick.plays;
  const latest = trick[trick.length - 1];
  const previous = trick.length > 1 ? trick[trick.length - 2] : undefined;

  return (
    <View style={styles.table}>
      <Felt />
      {/* Floating top bar */}
      <View style={[styles.topWrap, { top: insets.top + 6 }]} pointerEvents="box-none">
        <GlassSurface style={{ borderRadius: radius.pill }}>
          <View collapsable={false} style={styles.topBar}>
            <Pressable
              onPress={confirmLeave}
              accessibilityRole="button"
              accessibilityLabel="Leave game"
              hitSlop={10}
              style={styles.exit}
            >
              <Text style={styles.exitText}>✕</Text>
            </Pressable>
            <View style={styles.scores}>
              <Text style={[styles.scoreNum, { color: color.teamUs }]}>{g.scores[myTeam]}</Text>
              <Text style={styles.scoreTo}>to {g.targetScore}</Text>
              <Text style={[styles.scoreNum, { color: color.teamThem }]}>{g.scores[1 - myTeam]}</Text>
            </View>
            <Pressable
              onPress={toggleSound}
              accessibilityRole="button"
              accessibilityLabel={soundOn ? 'Mute' : 'Unmute'}
              hitSlop={8}
            >
              <Text style={styles.room}>{soundOn ? '♪' : '∅'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setHistoryOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Score history"
              hitSlop={8}
            >
              <Text style={styles.room}>{roomCode ?? '≡'}</Text>
            </Pressable>
            {!g.isSpectator && lastEvent?.id ? (
              <Pressable
                onPress={() => reportBot(lastEvent.id!)}
                accessibilityRole="button"
                accessibilityLabel="Report bot play"
                hitSlop={8}
              >
                <Text style={styles.room}>⚑</Text>
              </Pressable>
            ) : null}
          </View>
        </GlassSurface>
      </View>

      <View style={[styles.content, { paddingTop: insets.top + 68, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topRow}>
          <OpponentTile p={g.players[rel.top]} g={g} />
        </View>

        <View style={styles.middle}>
          <OpponentTile p={g.players[rel.left]} g={g} compact />
          <View style={styles.felt}>
            {g.wish.active && g.wish.wishedRank !== null && (
              <Text style={styles.wish}>Wish: {getRankLabel(g.wish.wishedRank)}</Text>
            )}
            {latest ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                {previous && (
                  <View style={{ alignItems: 'center', opacity: 0.55 }}>
                    <Text style={styles.playerLabel}>{g.players[previous.playerPosition]?.nickname}</Text>
                    <CardRow cards={previous.combination.cards} width={28} />
                  </View>
                )}
                <Text
                  style={[
                    styles.playerLabel,
                    latest.playerPosition === g.currentTrick.currentWinner && {
                      color: color.gold,
                    },
                  ]}
                >
                  {g.players[latest.playerPosition]?.nickname}
                  {latest.playerPosition === g.currentTrick.currentWinner ? ' ★' : ''}
                </Text>
                <CardRow
                  cards={latest.combination.cards}
                  width={trick.length && latest.combination.cards.length > 7 ? 30 : 42}
                />
              </View>
            ) : (
              <Text style={styles.dim}>{myTurn ? 'Your lead' : `${turnName} leads`}</Text>
            )}
          </View>
          <OpponentTile p={g.players[rel.right]} g={g} compact />
        </View>

        {/* Turn banner (floats over the table) */}
        <View style={styles.bannerWrap}>
          <GlassSurface style={styles.banner} tint={myTurn ? 'rgba(201,168,76,0.08)' : undefined}>
            <Text style={styles.bannerText}>
              {isDragon
                ? dragonMine
                  ? 'Choose who gets the Dragon'
                  : `${g.players[g.currentTrick.currentWinner ?? g.currentPlayer]?.nickname} is choosing`
                : myTurn
                  ? mustPlayWish
                    ? `Your turn · you must play the wish${g.wish.wishedRank ? ` (${getRankLabel(g.wish.wishedRank)})` : ''}`
                    : g.mustPass
                      ? 'Your turn · nothing beats it, pass'
                      : 'Your turn'
                  : `${turnName}'s turn`}
              {secs !== null && !isDragon ? `  ·  ${secs}s` : ''}
            </Text>
          </GlassSurface>
        </View>

        {/* Me */}
        <View style={styles.meRow}>
          <Text style={styles.meName} numberOfLines={1}>
            {me.nickname}
          </Text>
          {me.tichuCall !== 'none' && (
            <Text
              style={[
                styles.tichuBadge,
                me.tichuCall === 'grand_tichu' && {
                  backgroundColor: color.danger,
                },
              ]}
            >
              {me.tichuCall === 'grand_tichu' ? 'GRAND TICHU' : 'TICHU'}
            </Text>
          )}
          {me.isOut && <Text style={styles.tileBadge}>OUT #{me.finishOrder}</Text>}
        </View>

        {/* Floating action bar */}
        <GlassSurface style={{ borderRadius: radius.pill }} interactive>
          <View collapsable={false} style={styles.actions}>
            {g.canCallTichu ? (
              <Btn
                label="Tichu"
                kind="ghost"
                small
                onPress={() => confirmTichu(false, callTichu)}
                style={styles.actSmall}
              />
            ) : null}
            {g.isSolo && myTurn && canAct && !me.isOut ? (
              <Btn
                testID="hint"
                label={hinting ? '…' : 'Hint'}
                kind="ghost"
                small
                onPress={hint}
                style={styles.actSmall}
              />
            ) : null}
            <View style={{ flex: 1 }} />
            {myTurn && canAct && !me.isOut ? (
              <>
                {canPass && !mustPlayWish && (
                  <Btn
                    testID="pass"
                    label="Pass"
                    kind={g.mustPass ? 'gold' : 'ghost'}
                    onPress={passTurn}
                    style={styles.actBtn}
                  />
                )}
                <Btn
                  testID="play"
                  label={selected.length ? `Play ${selected.length}` : 'Play'}
                  kind="primary"
                  disabled={selected.length === 0}
                  onPress={play}
                  haptic="medium"
                  style={styles.actBtn}
                />
              </>
            ) : (
              <Text style={styles.waiting}>{me.isOut ? 'You are out' : myTurn ? '…' : 'Waiting'}</Text>
            )}
            {g.isSolo && me.isOut && (
              <Btn
                label="Skip round"
                kind="ghost"
                small
                onPress={useApp.getState().skipRound}
                style={styles.actSmall}
              />
            )}
          </View>
        </GlassSurface>

        <Hand cards={hand} selected={selected} onToggle={toggle} disabled={me.isOut} />
      </View>

      {dragonMine && <DragonSheet g={g} />}
      {wishMine && <WishSheet />}
      {historyOpen && (
        <ScoreHistorySheet history={g.roundHistory ?? []} myTeam={myTeam} onClose={() => setHistoryOpen(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  dim: { color: color.textDim, fontSize: 15 },
  table: { flex: 1 },
  topWrap: { position: 'absolute', left: 12, right: 12, zIndex: 10 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    minHeight: 52,
    paddingHorizontal: 8,
  },
  exit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: { color: color.text, fontSize: 20, fontWeight: '600' },
  scores: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 10,
  },
  scoreNum: { fontSize: 22, fontWeight: '800' },
  scoreTo: { color: color.textFaint, fontSize: 12 },
  room: {
    width: 40,
    textAlign: 'right',
    paddingRight: 4,
    color: color.textFaint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: { flex: 1, paddingHorizontal: 12, gap: 8 },
  topRow: { alignItems: 'center' },
  middle: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  felt: {
    flex: 1,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.22)',
    backgroundColor: 'rgba(9,23,32,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  wish: {
    position: 'absolute',
    top: 8,
    color: color.gold,
    fontWeight: '800',
    fontSize: 14,
  },
  playerLabel: { color: color.textDim, fontSize: 13, fontWeight: '700' },
  tile: {
    minWidth: 92,
    borderRadius: radius.md,
    backgroundColor: '#102333',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: 'rgba(201,168,76,0.22)',
  },
  tileCompact: {
    width: 72,
    minWidth: 72,
    alignSelf: 'center',
    paddingHorizontal: 4,
  },
  tileTurn: { borderColor: color.gold },
  tileName: {
    fontFamily: greekFont,
    fontSize: 15,
    fontWeight: '700',
    maxWidth: 90,
    textAlign: 'center',
  },
  tileNameCompact: { fontSize: 13, maxWidth: 62 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileCount: { color: color.text, fontSize: 17, fontWeight: '800' },
  tileBadge: { color: color.gold, fontSize: 12, fontWeight: '800' },
  tichuBadge: {
    backgroundColor: color.gold,
    color: color.goldInk,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  passChip: { color: color.textFaint, fontSize: 11, fontStyle: 'italic' },
  dcChip: { color: color.danger, fontSize: 11, fontWeight: '700' },
  bannerWrap: { alignItems: 'center' },
  banner: {
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  bannerText: {
    color: color.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  meRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  meName: { color: color.text, fontWeight: '800', fontSize: 15, flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    padding: 6,
    minHeight: 64,
  },
  actBtn: { minWidth: 72, flex: 1, paddingHorizontal: 12 },
  actSmall: { minWidth: 0, flexShrink: 1, paddingHorizontal: 8 },
  waiting: {
    color: color.textDim,
    fontSize: 16,
    fontWeight: '600',
    paddingRight: 14,
  },
});
