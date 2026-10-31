import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isQuickGame, toGreekUpper, type PlayerPosition } from '@cyprus/shared';
import { Btn } from './Btn';
import { StatusPills } from './ConnectionBar';
import { color, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';
import { useAuth } from '@/lib/authStore';
import { useT } from '@/lib/i18n';

/** `onInviteFriends` opens the friends list over the room, like the website's Invite friend button. */
export function WaitingRoom({ onInviteFriends }: { onInviteFriends?: () => void }) {
  const t = useT();
  const user = useAuth((s) => s.user);
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
    notify(t('waiting.codeCopied'));
  };

  const me = roomState?.players.find((p) => p.nickname === nickname);
  // Older servers don't send the length; show nothing rather than guess.
  const target = roomState?.targetScore;
  const length =
    typeof target !== 'number' ? null : isQuickGame(target) ? t('waiting.quickGame') : t('waiting.gameTo', { score: target });

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.top}>
        <Btn label={t('waiting.leave')} kind="ghost" small onPress={leave} />
        {/* Toasts ("Invite sent", "Room code copied") sit beside Leave, never over the room code. */}
        <View style={styles.status} pointerEvents="none">
          <StatusPills />
        </View>
      </View>
      <Text style={styles.small}>{toGreekUpper(t('lobby.roomCode'))}</Text>
      <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={t('waiting.codeA11y', { code: roomCode ?? '' })}>
        <Text style={styles.code}>{roomCode ?? '…'}</Text>
        <Text style={styles.copy}>{t('waiting.tapToCopy')}</Text>
      </Pressable>
      {length && (
        <Text testID="waiting-length" style={styles.length}>
          {length}
        </Text>
      )}

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
              accessibilityLabel={p ? t('waiting.seat', { n: pos + 1, name: p.nickname }) : t('waiting.seatEmpty', { n: pos + 1 })}
              style={[styles.seat, mine && styles.seatMe, !p && styles.seatEmpty]}
            >
              <Text style={styles.team}>{toGreekUpper(t(pos % 2 === 0 ? 'waiting.teamA' : 'waiting.teamB'))}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {p ? p.nickname : t('waiting.tapToSit')}
              </Text>
              {p && !p.connected && <Text style={styles.off}>{t('waiting.disconnected')}</Text>}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />
      {!roomState && <Text style={styles.info}>{t('waiting.connecting')}</Text>}
      {roomState && !roomState.isStartable && <Text style={styles.info}>{t('waiting.shareTheCode')}</Text>}
      {roomState?.isStartable && roomState.players.length < 4 && (
        <Text style={styles.info}>{t('waiting.emptySeats')}</Text>
      )}
      {user && onInviteFriends && (roomState?.players.length ?? 0) < 4 && (
        <Btn label={t('friends.inviteFriend')} kind="ghost" onPress={onInviteFriends} />
      )}
      <Btn label={t('waiting.startGame')} kind="gold" disabled={!roomState?.isStartable || !me} onPress={start} haptic="medium" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  status: { flex: 1, alignItems: 'flex-end', gap: 6 },
  small: { color: color.textDim, textAlign: 'center', fontSize: 13, fontWeight: '700', letterSpacing: 1.2, marginTop: 10 },
  code: { color: color.gold, fontSize: 56, fontWeight: '900', letterSpacing: 6, textAlign: 'center' },
  copy: { color: color.textFaint, textAlign: 'center', fontSize: 13, marginBottom: 14 },
  length: { color: color.gold, textAlign: 'center', fontSize: 15, fontWeight: '700', marginTop: -6, marginBottom: 14 },
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
