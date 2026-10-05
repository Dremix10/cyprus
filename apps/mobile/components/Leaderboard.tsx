import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LeaderboardEntry, MyLeaderboardStats } from '@cyprus/shared';
import { Btn } from './Btn';
import { GlassCard, GoldTitle, Hall } from './Olympus';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authStore';
import { useT } from '@/lib/i18n';
import { color, greekFont } from '@/lib/theme';

type Result = {
  game_id: number;
  ended_at: string;
  won: boolean;
  myScore: number;
  opponentScore: number;
  botDifficulty: string | null;
};
const rate = (row: LeaderboardEntry) => (row.games_played ? Math.round((100 * row.games_won) / row.games_played) : 0);
const calls = (success: number, total: number) => (total ? `${success}/${total}` : '—');

function Stats({ row, rank }: { row: LeaderboardEntry; rank?: number }) {
  const t = useT();
  const items = [
    ...(rank !== undefined ? [[t('leaderboard.rank'), rank > 0 ? `#${rank}` : t('leaderboard.unranked')]] : []),
    [t('leaderboard.elo'), row.elo],
    [t('leaderboard.eloPeak'), row.elo_peak],
    [t('leaderboard.games'), row.games_played],
    [t('leaderboard.wl'), `${row.games_won}/${row.games_lost}`],
    [t('leaderboard.winRate'), `${rate(row)}%`],
    [t('leaderboard.firstOut'), row.first_out_count],
    [t('leaderboard.tichu'), calls(row.tichu_successes, row.tichu_calls)],
    [t('leaderboard.grand'), calls(row.grand_tichu_successes, row.grand_tichu_calls)],
    [t('leaderboard.dv'), row.double_victories],
    [t('leaderboard.rounds'), row.total_rounds],
  ];
  return (
    <View style={styles.grid}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.stat}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [mine, setMine] = useState<MyLeaderboardStats | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null);
    setMine(null);
    setHistory([]);
    setError(false);
    const load = async () => {
      try {
        const response = await api('/api/leaderboard?limit=50');
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const entries: LeaderboardEntry[] = await response.json();
        if (live) setRows(entries);
        if (user) {
          const [stats, games] = await Promise.all([api('/api/leaderboard/me'), api('/api/leaderboard/history')]);
          const own = stats.ok ? await stats.json() : null;
          const results = games.ok ? await games.json() : [];
          if (live) {
            setMine(own);
            setHistory(results);
          }
        }
      } catch {
        if (live) setError(true);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [user?.id, retry]);
  return (
    <Hall>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      >
        <GoldTitle title={t('leaderboard.title')} subtitle={t('leaderboard.subtitle')} />
        {mine && (
          <GlassCard>
            <Text style={styles.heading}>{t('leaderboard.yourStats')}</Text>
            <Stats row={mine} rank={mine.rank} />
            {history.length > 0 && (
              <>
                <Text style={styles.section}>{t('leaderboard.recent')}</Text>
                {history.map((game) => (
                  <View key={game.game_id} style={styles.result}>
                    <Text style={[styles.resultBadge, { color: game.won ? color.ok : color.danger }]}>
                      {t(game.won ? 'leaderboard.win' : 'leaderboard.loss')}
                    </Text>
                    <Text style={styles.resultScore}>
                      {game.myScore} – {game.opponentScore}
                    </Text>
                    <Text style={styles.label}>
                      {game.botDifficulty ? t(`lobby.${game.botDifficulty}`) : t('lobby.playOnline')}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </GlassCard>
        )}
        {error ? (
          <GlassCard>
            <Text style={styles.label}>{t('leaderboard.loadFailed')}</Text>
            <Btn label={t('leaderboard.retry')} kind="ghost" onPress={() => setRetry((n) => n + 1)} />
          </GlassCard>
        ) : rows === null ? (
          <Text style={styles.empty}>{t('leaderboard.loading')}</Text>
        ) : rows.length === 0 ? (
          <GlassCard>
            <Text style={styles.empty}>{t('leaderboard.noPlayers')}</Text>
          </GlassCard>
        ) : (
          <View style={styles.rankings}>
            <View style={styles.tableHeader}>
              <Text style={styles.section}>{t('leaderboard.player')}</Text>
              <Text style={styles.label}>{t('leaderboard.elo')}</Text>
            </View>
            {rows.map((row, i) => (
              <View key={row.user_id} style={[styles.player, row.user_id === mine?.user_id && styles.mine]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open === row.user_id }}
                  accessibilityLabel={`${row.display_name}, ${row.elo} ${t('leaderboard.elo')}, ${t('leaderboard.details')}`}
                  onPress={() => setOpen(open === row.user_id ? null : row.user_id)}
                  style={styles.playerHeader}
                >
                  <Text style={[styles.rank, i < 3 && { color: color.gold }]}>{i + 1}</Text>
                  <View style={styles.identity}>
                    <Text style={styles.name} numberOfLines={1}>
                      {row.is_bot ? '⚙ ' : ''}
                      {row.display_name}
                    </Text>
                    <Text style={styles.label}>
                      {row.games_won}/{row.games_lost} {t('leaderboard.wl')} · {rate(row)}% {t('leaderboard.winRate')}
                    </Text>
                  </View>
                  <View style={styles.rating}>
                    <Text style={styles.elo}>{row.elo}</Text>
                    <Text style={styles.label}>{open === row.user_id ? '−' : '+'}</Text>
                  </View>
                </Pressable>
                {open === row.user_id && <Stats row={row} />}
              </View>
            ))}
            <Text style={styles.footnote}>{t('leaderboard.details')}</Text>
          </View>
        )}
        <Btn label={t('leaderboard.backToLobby')} kind="ghost" onPress={onClose} />
      </ScrollView>
    </Hall>
  );
}
const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, gap: 20 },
  heading: { color: color.gold, fontFamily: greekFont, fontSize: 23 },
  section: {
    color: color.gold,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
    rowGap: 18,
  },
  stat: { width: '33.33%', alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  value: {
    color: color.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  label: { color: color.textDim, fontSize: 11, textAlign: 'center' },
  rankings: {
    backgroundColor: 'rgba(10,20,35,0.88)',
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderColor: color.line,
  },
  player: {
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  mine: { backgroundColor: 'rgba(201,168,76,0.12)' },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 80,
  },
  identity: { flex: 1, gap: 7, alignItems: 'flex-start' },
  name: { color: color.text, fontWeight: '700', fontSize: 16 },
  rank: {
    width: 24,
    color: color.textDim,
    fontFamily: greekFont,
    fontSize: 22,
  },
  rating: { alignItems: 'center', gap: 4 },
  elo: { color: color.gold, fontWeight: '800', fontSize: 19 },
  empty: {
    color: color.textDim,
    textAlign: 'center',
    padding: 12,
    lineHeight: 22,
  },
  footnote: {
    color: color.textDim,
    padding: 16,
    textAlign: 'center',
    fontSize: 12,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  resultBadge: { fontSize: 12, fontWeight: '800', width: 48 },
  resultScore: { color: color.text, flex: 1, fontWeight: '600' },
});
