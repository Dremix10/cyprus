import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from './Btn';
import { color } from '@/lib/theme';

const ROWS: [string, string][] = [
  ['Goal', 'Two teams of two (seats across from each other). Be first to the target score over several rounds.'],
  ['A round', 'Go out of cards before the others. Win tricks to collect points: Kings and 10s are 10, 5s are 5, Dragon +25, Phoenix −25.'],
  ['Playing', 'Lead any combination. Others must beat it with the same kind (higher), or pass. Bombs beat anything.'],
  ['Combinations', 'Single, pair, triple, full house, straight (5+), run of pairs, and the bombs: four of a kind or a straight flush.'],
  ['Mahjong', 'The 1. Whoever leads with it may wish for a rank; the next player who can must play it.'],
  ['Dog', 'Leads only. Passes the lead to your partner.'],
  ['Phoenix', 'Wild in combinations, or a single worth half a point more than the card under it.'],
  ['Dragon', 'The highest single. Whoever wins the trick with it gives the trick to an opponent.'],
  ['Tichu', 'Call Tichu (+100) or Grand Tichu (+200, before you see the last 6 cards) if you expect to go out first. Miss it and you lose the same.'],
  ['Passing', 'Each round every player passes one card to each of the other three players.'],
];

export function RulesSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <Text style={styles.title}>How to play Titsu</Text>
      <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 12 }}>
        {ROWS.map(([h, t]) => (
          <View key={h}>
            <Text style={styles.h}>{h}</Text>
            <Text style={styles.t}>{t}</Text>
          </View>
        ))}
      </ScrollView>
      <Btn label="Done" kind="gold" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, gap: 8, backgroundColor: color.feltDeep },
  title: { color: color.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  h: { color: color.gold, fontWeight: '800', fontSize: 15, marginBottom: 2 },
  t: { color: color.text, fontSize: 16, lineHeight: 22 },
});
