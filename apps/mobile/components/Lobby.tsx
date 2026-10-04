import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn } from './Btn';
import { color, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';
import { DIFFICULTIES, SCORE_OPTIONS } from '@/lib/config';

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable
          key={String(o)}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          onPress={() => onChange(o)}
          style={[styles.segItem, o === value && styles.segActive]}
        >
          <Text style={[styles.segText, o === value && styles.segTextActive]}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Lobby({ onRules }: { onRules: () => void }) {
  const insets = useSafeAreaInsets();
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const targetScore = useApp((s) => s.targetScore);
  const setTargetScore = useApp((s) => s.setTargetScore);
  const difficulty = useApp((s) => s.difficulty);
  const setDifficulty = useApp((s) => s.setDifficulty);
  const busy = useApp((s) => s.busy);
  const conn = useApp((s) => s.conn);
  const createSolo = useApp((s) => s.createSolo);
  const createRoom = useApp((s) => s.createRoom);
  const joinRoom = useApp((s) => s.joinRoom);
  const [code, setCode] = useState('');
  const canGo = nickname.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={styles.title}>TITSU</Text>
        <Text style={styles.sub}>Cyprus · four players, two teams</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Nickname</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            testID="nickname"
            placeholder="Your name"
            placeholderTextColor={color.textFaint}
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            style={styles.input}
          />

          <Text style={styles.label}>Play to</Text>
          <Segmented options={SCORE_OPTIONS} value={targetScore as (typeof SCORE_OPTIONS)[number]} onChange={setTargetScore} label={String} />

          <Text style={styles.label}>Bot difficulty</Text>
          <Segmented
            options={DIFFICULTIES}
            value={difficulty as (typeof DIFFICULTIES)[number]}
            onChange={setDifficulty}
            label={(d) => d[0].toUpperCase() + d.slice(1)}
          />
        </View>

        <Btn testID="play-solo" label={busy ? 'Starting…' : 'Play solo'} kind="gold" disabled={!canGo || conn !== 'connected'} onPress={createSolo} haptic="medium" />
        <Btn label="Create room" kind="ghost" disabled={!canGo || conn !== 'connected'} onPress={createRoom} />

        <View style={styles.joinRow}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Room code"
            placeholderTextColor={color.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            style={[styles.input, { flex: 1 }]}
          />
          <Btn label="Join" kind="ghost" disabled={!canGo || !code.trim() || conn !== 'connected'} onPress={() => joinRoom(code)} />
        </View>

        <Pressable onPress={onRules} accessibilityRole="button" style={styles.rules}>
          <Text style={styles.rulesText}>How to play</Text>
        </Pressable>
        {conn !== 'connected' && <Text style={styles.hint}>Connecting to the server…</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, gap: 14 },
  title: { color: color.gold, fontSize: 52, fontWeight: '900', letterSpacing: 8, textAlign: 'center' },
  sub: { color: color.textDim, fontSize: 15, textAlign: 'center', marginBottom: 14 },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: 18, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  label: { color: color.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
    color: color.text,
    paddingHorizontal: 16,
    fontSize: 18,
  },
  seg: { flexDirection: 'row', backgroundColor: color.surfaceRaised, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.md - 3, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: '#1F9D63' },
  segText: { color: color.textDim, fontSize: 14, fontWeight: '600' },
  segTextActive: { color: color.white },
  joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  rules: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  rulesText: { color: color.textDim, fontSize: 15, textDecorationLine: 'underline' },
  hint: { color: color.textFaint, textAlign: 'center' },
});
