import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlayerPosition } from '@cyprus/shared';
import { Btn } from './Btn';
import { color, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';

export function WaitingRoom() {
  const insets = useSafeAreaInsets();
  const roomCode = useApp((s) => s.roomCode);
  const roomState = useApp((s) => s.roomState);
  const nickname = useApp((s) => s.nickname);
  const sit = useApp((s) => s.sit);
  const start = useApp((s) => s.start);
  const leave = useApp((s) => s.leave);
  const notify = useApp((s) => s.notify);

  const copy = async () => {
    if (!roomCode) return;
    await Clipboard.setStringAsync(roomCode);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    notify('Room code copied');
  };

  const me = roomState?.players.find((p) => p.nickname === nickname);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.top}>
        <Btn label="Leave" kind="ghost" small onPress={leave} />
      </View>
      <Text style={styles.small}>ROOM CODE</Text>
      <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Room code ${roomCode}. Tap to copy`}>
        <Text style={styles.code}>{roomCode ?? '…'}</Text>
        <Text style={styles.copy}>Tap to copy</Text>
      </Pressable>

      <View style={styles.grid}>
        {([0, 1, 2, 3] as PlayerPosition[]).map((pos) => {
          const p = roomState?.players.find((x) => x.position === pos);
          const mine = !!p && p.nickname === nickname;
          return (
            <Pressable
              key={pos}
              disabled={!!p}
              onPress={() => sit(pos)}
              accessibilityRole="button"
              accessibilityLabel={p ? `Seat ${pos + 1}, ${p.nickname}` : `Seat ${pos + 1}, empty. Tap to sit`}
              style={[styles.seat, mine && styles.seatMe, !p && styles.seatEmpty]}
            >
              <Text style={styles.team}>{pos % 2 === 0 ? 'Team A' : 'Team B'}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {p ? p.nickname : 'Tap to sit'}
              </Text>
              {p && !p.connected && <Text style={styles.off}>disconnected</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      {!roomState && <Text style={styles.info}>Connecting to the room…</Text>}
      {roomState && !roomState.isStartable && <Text style={styles.info}>Waiting for players. Share the code.</Text>}
      {roomState?.isStartable && roomState.players.length < 4 && (
        <Text style={styles.info}>Empty seats will be filled by bots.</Text>
      )}
      <Btn label="Start game" kind="gold" disabled={!roomState?.isStartable || !me} onPress={start} haptic="medium" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, gap: 8 },
  top: { alignItems: 'flex-start' },
  small: { color: color.textDim, textAlign: 'center', fontSize: 13, fontWeight: '700', letterSpacing: 1.2, marginTop: 10 },
  code: { color: color.gold, fontSize: 56, fontWeight: '900', letterSpacing: 6, textAlign: 'center' },
  copy: { color: color.textFaint, textAlign: 'center', fontSize: 13, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  seat: {
    width: '47.8%',
    minHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    padding: 14,
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  seatMe: { borderColor: color.gold },
  seatEmpty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: color.line },
  team: { color: color.textFaint, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  name: { color: color.text, fontSize: 18, fontWeight: '700' },
  off: { color: color.danger, fontSize: 12 },
  info: { color: color.textDim, textAlign: 'center', marginBottom: 6 },
});
