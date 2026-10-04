import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NormalRank, getCardPoints, getRankLabel, type PlayerPosition, type ClientGameState } from '@cyprus/shared';
import { Btn } from './Btn';
import { Hand } from './Hand';
import { CardView } from './CardView';
import { Sheet } from './Sheet';
import { color, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';

const myTeamOf = (g: ClientGameState) => (g.myPosition % 2) as 0 | 1;

function names(g: ClientGameState, pred: (i: ClientGameState['players'][number]) => boolean) {
  return g.players.filter(pred).map((p) => p.nickname).join(', ');
}

export function confirmTichu(grand: boolean, onYes: () => void) {
  Alert.alert(
    grand ? 'Call Grand Tichu?' : 'Call Tichu?',
    grand
      ? 'Win +200 if you go out first, lose 200 if you do not.'
      : 'Win +100 if you go out first, lose 100 if you do not.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: grand ? 'Grand Tichu' : 'Call Tichu', style: 'destructive', onPress: onYes },
    ],
  );
}

// ── Grand Tichu ─────────────────────────────────────────────────────
export function GrandTichuView({ g }: { g: ClientGameState }) {
  const insets = useSafeAreaInsets();
  const decide = useApp((s) => s.grandTichu);
  return (
    <View style={[styles.phase, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
      <Text style={styles.h1}>Grand Tichu?</Text>
      <Text style={styles.p}>These are your first 8 cards. Call only if you expect to go out first.</Text>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Hand cards={g.myHand} selected={[]} onToggle={() => {}} disabled cardWidth={62} />
      </View>
      {g.grandTichuPending ? (
        <View style={{ gap: 10 }}>
          <Btn label="Call Grand Tichu" kind="gold" haptic="medium" onPress={() => confirmTichu(true, () => decide(true))} />
          <Btn label="Pass" kind="ghost" onPress={() => decide(false)} />
        </View>
      ) : (
        <Text style={styles.p}>Waiting for {names(g, (p) => !p.grandTichuDecided) || 'the others'}…</Text>
      )}
    </View>
  );
}

// ── Passing ─────────────────────────────────────────────────────────
type Slot = 'left' | 'across' | 'right';
const SLOTS: Slot[] = ['left', 'across', 'right'];

export function PassingView({ g }: { g: ClientGameState }) {
  const insets = useSafeAreaInsets();
  const passCards = useApp((s) => s.passCards);
  const undoPass = useApp((s) => s.undoPass);
  const callTichu = useApp((s) => s.callTichu);
  const me = g.players[g.myPosition];
  const [assign, setAssign] = useState<Record<Slot, string | null>>({ left: null, across: null, right: null });
  const [active, setActive] = useState<Slot>('left');

  const target: Record<Slot, PlayerPosition> = {
    left: ((g.myPosition + 3) % 4) as PlayerPosition,
    across: ((g.myPosition + 2) % 4) as PlayerPosition,
    right: ((g.myPosition + 1) % 4) as PlayerPosition,
  };
  const ready = g.players.filter((p) => p.hasPassed).length;
  const canTichu = g.canCallTichu ?? (me.tichuCall === 'none' && !g.hasPlayedCards);

  if (me.hasPassed) {
    return (
      <View style={[styles.phase, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.h1}>Cards passed</Text>
        <Text style={styles.p}>{ready}/4 ready · waiting for {names(g, (p) => !p.hasPassed) || 'the others'}…</Text>
        <View style={{ flex: 1 }} />
        <Btn
          label="Change cards"
          kind="ghost"
          onPress={() => {
            undoPass();
            setAssign({ left: null, across: null, right: null });
            setActive('left');
          }}
        />
      </View>
    );
  }

  const placed = new Set(Object.values(assign).filter(Boolean) as string[]);
  const complete = SLOTS.every((s) => assign[s]);

  const nextEmpty = (a: Record<Slot, string | null>): Slot | null => SLOTS.find((s) => !a[s]) ?? null;

  const tapCard = (id: string) => {
    // Tapping a placed card takes it back.
    const owner = SLOTS.find((s) => assign[s] === id);
    if (owner) {
      setAssign((a) => ({ ...a, [owner]: null }));
      setActive(owner);
      return;
    }
    const a = { ...assign, [active]: id };
    setAssign(a);
    const n = nextEmpty(a);
    if (n) setActive(n);
  };

  return (
    <View style={[styles.phase, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.h1}>Pass three cards</Text>
      <Text style={styles.p}>Pick a slot, then tap a card. {ready}/4 ready.</Text>
      <View style={styles.slots}>
        {SLOTS.map((s) => {
          const p = g.players[target[s]];
          const mate = target[s] % 2 === g.myPosition % 2;
          const card = g.myHand.find((c) => c.id === assign[s]);
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={`Pass to ${p.nickname}${card ? ', card chosen' : ', empty'}`}
              onPress={() => {
                if (card) setAssign((a) => ({ ...a, [s]: null }));
                setActive(s);
              }}
              style={[styles.slot, active === s && styles.slotActive, mate && styles.slotMate]}
            >
              <Text style={styles.slotName} numberOfLines={1}>
                {mate ? 'Partner' : s === 'left' ? 'Left' : 'Right'}
              </Text>
              <Text style={styles.slotSub} numberOfLines={1}>
                {p.nickname}
              </Text>
              <View style={styles.slotCard}>
                {card ? <CardView card={card} width={52} /> : <Text style={styles.slotEmpty}>＋</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Hand cards={g.myHand} selected={[...placed]} onToggle={tapCard} cardWidth={58} />
      </View>
      <View style={{ gap: 10, marginTop: 14 }}>
        <Btn
          label="Pass cards"
          kind="gold"
          disabled={!complete}
          haptic="medium"
          onPress={() => passCards({ left: assign.left!, across: assign.across!, right: assign.right! })}
        />
        {canTichu && <Btn label="Call Tichu" kind="ghost" small onPress={() => confirmTichu(false, callTichu)} />}
      </View>
    </View>
  );
}

// ── Wish (after Mahjong) ────────────────────────────────────────────
const WISH_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as NormalRank[];

export function WishSheet() {
  const wish = useApp((s) => s.wish);
  return (
    <Sheet>
      <Text style={styles.h2}>You played the Mahjong</Text>
      <Text style={styles.p}>Wish for a rank. Whoever can play it must.</Text>
      <View style={styles.wishGrid}>
        {WISH_RANKS.map((r) => (
          <Pressable key={r} accessibilityRole="button" accessibilityLabel={`Wish ${getRankLabel(r)}`} onPress={() => wish(r)} style={styles.wishBtn}>
            <Text style={styles.wishText}>{getRankLabel(r)}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

// ── Dragon give ─────────────────────────────────────────────────────
export function DragonSheet({ g }: { g: ClientGameState }) {
  const give = useApp((s) => s.dragonGive);
  const opp = g.players.filter((p) => p.position % 2 !== g.myPosition % 2);
  return (
    <Sheet>
      <Text style={styles.h2}>You won with the Dragon</Text>
      <Text style={styles.p}>Give the trick to an opponent.</Text>
      {opp.map((p) => (
        <Btn key={p.position} label={p.nickname} kind="ghost" onPress={() => give(p.position)} />
      ))}
    </Sheet>
  );
}

// ── Round scoring ───────────────────────────────────────────────────
export function ScoringView({ g }: { g: ClientGameState }) {
  const insets = useSafeAreaInsets();
  const next = useApp((s) => s.nextRound);
  const t = myTeamOf(g);
  const b = g.roundBreakdown;
  const teams = [
    { label: 'Your team', idx: t },
    { label: 'Opponents', idx: (1 - t) as 0 | 1 },
  ];
  return (
    <View style={[styles.phase, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.h1}>Round over</Text>
      <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 8 }}>
        {teams.map(({ label, idx }) => (
          <View key={idx} style={styles.scoreCard}>
            <View style={styles.rowBetween}>
              <Text style={[styles.teamLabel, { color: idx === t ? color.teamUs : color.teamThem }]}>{label}</Text>
              <Text style={styles.big}>
                +{g.roundScores[idx]} <Text style={styles.dim}>→ {g.scores[idx]}</Text>
              </Text>
            </View>
            {b && <Text style={styles.line}>Card points: {b.cardPoints[idx]}</Text>}
            {b?.doubleVictory === idx && <Text style={[styles.line, { color: color.gold }]}>Double victory +200</Text>}
            {b?.tichuResults
              .filter((r) => r.team === idx)
              .map((r, i) => (
                <Text key={i} style={[styles.line, { color: r.success ? color.ok : color.danger }]}>
                  {g.players.find((p) => p.position === r.position)?.nickname}: {r.call === 'grand_tichu' ? 'Grand Tichu' : 'Tichu'}{' '}
                  {r.success ? '+' : '−'}
                  {r.call === 'grand_tichu' ? 200 : 100}
                </Text>
              ))}
            {g.roundTrickCards && (
              <Text style={styles.line}>
                Point cards won:{' '}
                {g.roundTrickCards[idx].filter((c) => getCardPoints(c) !== 0).length}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
      <Btn label="Next round" kind="gold" haptic="medium" onPress={next} />
    </View>
  );
}

// ── Game over ───────────────────────────────────────────────────────
export function GameOverView({ g }: { g: ClientGameState }) {
  const insets = useSafeAreaInsets();
  const leave = useApp((s) => s.leave);
  const t = myTeamOf(g);
  const winner = g.scores[0] >= g.targetScore && g.scores[0] >= g.scores[1] ? 0 : g.scores[1] >= g.targetScore ? 1 : g.scores[0] > g.scores[1] ? 0 : 1;
  const won = winner === t;
  return (
    <View style={[styles.phase, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 16 }]}>
      <Text style={[styles.h1, { fontSize: 44, color: won ? color.gold : color.textDim }]}>{won ? 'Victory' : 'Defeat'}</Text>
      <Text style={styles.p}>{won ? 'Your team wins the game.' : 'The opponents win the game.'}</Text>
      <View style={styles.scoreCard}>
        <View style={styles.rowBetween}>
          <Text style={[styles.teamLabel, { color: color.teamUs }]}>Your team</Text>
          <Text style={styles.big}>{g.scores[t]}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={[styles.teamLabel, { color: color.teamThem }]}>Opponents</Text>
          <Text style={styles.big}>{g.scores[1 - t]}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Btn label="Back to lobby" kind="gold" haptic="medium" onPress={leave} />
    </View>
  );
}

const styles = StyleSheet.create({
  phase: { flex: 1, paddingHorizontal: 18, gap: 10 },
  h1: { color: color.text, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  h2: { color: color.text, fontSize: 22, fontWeight: '800' },
  p: { color: color.textDim, fontSize: 15, textAlign: 'center' },
  slots: { flexDirection: 'row', gap: 10, marginTop: 6 },
  slot: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: 10,
    alignItems: 'center',
    gap: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  slotActive: { borderColor: color.gold },
  slotMate: { backgroundColor: '#17402E' },
  slotName: { color: color.text, fontWeight: '800', fontSize: 15 },
  slotSub: { color: color.textFaint, fontSize: 12 },
  slotCard: { minHeight: 74, justifyContent: 'center', marginTop: 6 },
  slotEmpty: { color: color.textFaint, fontSize: 30 },
  wishGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  wishBtn: {
    width: 62,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishText: { color: color.text, fontSize: 22, fontWeight: '800' },
  scoreCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 16, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamLabel: { fontSize: 17, fontWeight: '800' },
  big: { color: color.text, fontSize: 24, fontWeight: '800' },
  dim: { color: color.textDim, fontSize: 17, fontWeight: '600' },
  line: { color: color.textDim, fontSize: 15 },
});
