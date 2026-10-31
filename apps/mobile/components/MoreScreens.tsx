import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Friend, FriendRequest, RoundHistoryEntry } from '@cyprus/shared';
import { Btn } from './Btn';
import { GlassCard, GoldTitle, Hall } from './Olympus';
import { Sheet } from './Sheet';
import { color, greekFont } from '@/lib/theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authStore';
import { t as tr, useT } from '@/lib/i18n';
import { useApp } from '@/lib/store';

function Back({ label, onPress }: { label: string; onPress: () => void }) {
  return <Btn label={label} kind="ghost" onPress={onPress} />;
}

export function TutorialScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const total = 19;
  const paragraphs: string[] = [];
  for (let i = 0; i < 12; i++) {
    const key = `tutorial.${step}.text.${i}`;
    const line = t(key);
    if (line === key) break;
    paragraphs.push(line);
  }
  return (
    <Hall>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <GoldTitle title={t('tutorial.title')} subtitle={t('tutorial.stepOf', { current: step + 1, total })} />
        <GlassCard>
          <Text style={styles.h}>{t(`tutorial.${step}.title`)}</Text>
          {paragraphs.map((p) => <Text key={p} style={styles.p}>{p}</Text>)}
        </GlassCard>
        <View style={styles.row}>
          <Btn label={t('tutorial.previous')} kind="ghost" disabled={step === 0} onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
          {step < total - 1 ? (
            <Btn label={t('tutorial.next')} kind="gold" onPress={() => setStep((s) => s + 1)} style={{ flex: 1 }} />
          ) : (
            <Btn label={t('tutorial.startPlaying')} kind="gold" onPress={onClose} style={{ flex: 1 }} />
          )}
        </View>
        <Back label={t('tutorial.backToLobby')} onPress={onClose} />
      </ScrollView>
    </Hall>
  );
}

export { LeaderboardScreen } from './Leaderboard';

export function LiveGamesScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const spectate = useApp((s) => s.spectate);
  const [games, setGames] = useState<Array<{ roomCode: string; players: Array<{ nickname: string; isBot: boolean }>; scores: [number, number]; phase: string }> | null>(null);

  useEffect(() => {
    void api('/api/live-games').then(async (r) => { if (r.ok) setGames(await r.json()); else setGames([]); });
  }, []);

  return (
    <Hall>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <GoldTitle title={t('live.title')} subtitle={t('live.subtitle')} />
        <GlassCard>
          {games === null && <Text style={styles.p}>{t('leaderboard.loading')}</Text>}
          {games?.length === 0 && <Text style={styles.p}>{t('live.none')}</Text>}
          {games?.map((g) => (
            <View key={g.roomCode} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{g.roomCode} · {g.scores[0]}–{g.scores[1]}</Text>
                <Text style={styles.meta}>{g.players.map((p) => p.nickname).join(', ')}</Text>
              </View>
              <Btn label={t('live.watch')} kind="gold" small onPress={() => { void spectate(g.roomCode); onClose(); }} />
            </View>
          ))}
        </GlassCard>
        <Back label={t('lobby.back')} onPress={onClose} />
      </ScrollView>
    </Hall>
  );
}

export function FriendsScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ id: number; username: string; displayName: string; friendStatus: string }>>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const invite = useApp((s) => s.inviteFriend);
  const [invitingId, setInvitingId] = useState<number | null>(null);

  const reload = async () => {
    const [f, r] = await Promise.all([api('/api/friends'), api('/api/friends/requests')]);
    if (f.ok) setFriends(await f.json());
    if (r.ok) setRequests(await r.json());
  };

  useEffect(() => { void reload(); }, []);

  const search = async () => {
    const res = await api(`/api/friends/search?q=${encodeURIComponent(q.trim())}`);
    if (res.ok) setFound(await res.json());
  };

  return (
    <Hall>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <GoldTitle title={t('friends.title')} />
        <GlassCard>
          <TextInput value={q} onChangeText={setQ} placeholder={t('friends.searchPlaceholder')} placeholderTextColor={color.textFaint} style={styles.input} />
          <Btn label={t('friends.searching').replace('...', '')} kind="gold" onPress={() => { void search(); }} />
          {found.map((u) => (
            <View key={u.id} style={styles.line}>
              <Text style={[styles.name, { flex: 1 }]}>{u.displayName}</Text>
              {u.friendStatus === 'none' && (
                <Btn label={t('friends.add')} kind="ghost" small onPress={() => { void api('/api/friends/request', { method: 'POST', body: JSON.stringify({ friendId: u.id }) }).then(reload); }} />
              )}
            </View>
          ))}
        </GlassCard>
        {requests.length > 0 && (
          <GlassCard>
            <Text style={styles.h}>{t('friends.requests')}</Text>
            {requests.map((r) => (
              <View key={r.id} style={styles.line}>
                <Text style={[styles.name, { flex: 1 }]}>{r.displayName}</Text>
                <Btn label={t('friends.accept')} kind="gold" small onPress={() => { void api('/api/friends/accept', { method: 'POST', body: JSON.stringify({ userId: r.id }) }).then(reload); }} />
              </View>
            ))}
          </GlassCard>
        )}
        <GlassCard>
          <Text style={styles.h}>{t('friends.friends')}</Text>
          {friends.length === 0 && <Text style={styles.p}>{t('friends.noFriendsYet')}</Text>}
          {friends.map((f) => (
            <View key={f.id} style={styles.line}>
              <Text style={[styles.name, { flex: 1 }]}>{f.displayName} · {f.online ? t('friends.online') : t('friends.offline')}</Text>
              {f.online && (
                <Btn
                  label={invitingId === f.id ? t('friends.sending') : t('friends.invite')}
                  kind="gold"
                  small
                  disabled={invitingId !== null}
                  onPress={() => {
                    if (invitingId !== null) return;
                    setInvitingId(f.id);
                    void invite(f.id).then((res) => {
                      setInvitingId(null);
                      if (res.createdRoom) onClose();
                    });
                  }}
                />
              )}
            </View>
          ))}
        </GlassCard>
        <Back label={t('profile.back')} onPress={onClose} />
      </ScrollView>
    </Hall>
  );
}

const AVATARS: Record<string, string> = {
  zeus: '⚡', athena: '🦉', poseidon: '🔱', apollo: '☀️', artemis: '🌙', hermes: '👟',
  ares: '⚔️', hera: '👑', aphrodite: '🌹', hephaestus: '🔨', demeter: '🌾', dionysus: '🍇',
};

export function ProfileScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const changeAvatar = useAuth((s) => s.changeAvatar);
  const changeDisplayName = useAuth((s) => s.changeDisplayName);
  const logout = useAuth((s) => s.logout);
  const [name, setName] = useState(user?.displayName ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;
  return (
    <Hall>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <GoldTitle title={t('profile.title')} subtitle={user.username} />
        <GlassCard>
          <Text style={styles.h}>{user.avatar ? AVATARS[user.avatar] ?? user.avatar : '⚡'} {user.displayName}</Text>
          <Text style={styles.p}>{t('profile.email')}: {user.email ?? t('profile.notSet')}</Text>
          <Text style={styles.p}>{t('profile.google')}: {user.hasGoogle ? t('profile.linked') : t('profile.notLinked')}</Text>
          <Text style={styles.p}>Apple: {user.hasApple ? t('profile.linked') : t('profile.notLinked')}</Text>
          <Text style={styles.p}>{t('profile.gameStats')}: {user.gamesWon}/{user.gamesPlayed}</Text>
          <View style={styles.avatars}>
            {Object.entries(AVATARS).map(([id, emoji]) => (
              <Pressable key={id} onPress={() => { void changeAvatar(id); }} style={[styles.avatar, user.avatar === id && styles.avatarOn]}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
          <Btn label={t('profile.save')} kind="gold" onPress={() => { void changeDisplayName(name).then((r) => setMsg(r.success ? t('profile.updated') : (r.error ?? t('error.failed')))); }} />
          {msg ? <Text style={styles.p}>{msg}</Text> : null}
          <Btn label={t('profile.signOut')} kind="ghost" onPress={() => { void logout().then(onClose); }} />
        </GlassCard>
        <Btn testID="delete-account" label={t('profile.deleteAccount')} kind="danger" onPress={() => setDeleting(true)} />
        <Back label={t('profile.back')} onPress={onClose} />
      </ScrollView>
      {deleting && <DeleteAccountSheet onCancel={() => setDeleting(false)} onDeleted={onClose} />}
    </Hall>
  );
}

/**
 * Delete account (App Store guideline 5.1.1(v)): a confirmation step that says what goes.
 * Only accounts with a password type it. Apple/Google-only accounts send an empty one, which
 * the server accepts for them. On success the store has already signed out locally.
 */
function DeleteAccountSheet({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const notify = useApp((s) => s.notify);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsPassword = user?.hasPassword === true;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount(needsPassword ? password : '');
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? t('error.failed'));
      return;
    }
    notify(t('profile.accountDeleted'));
    onDeleted();
  };

  return (
    <Sheet onClose={busy ? undefined : onCancel} avoidKeyboard>
      <Text style={styles.sheetTitle}>{t('profile.deleteTitle')}</Text>
      <Text style={styles.warn}>{t('profile.deleteExplain')}</Text>
      <Text style={styles.warn}>{t('profile.deleteWarning')}</Text>
      {needsPassword && (
        <TextInput
          testID="delete-password"
          value={password}
          onChangeText={setPassword}
          placeholder={t('profile.enterPasswordConfirm')}
          placeholderTextColor={color.textFaint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          style={styles.input}
        />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Btn
        testID="delete-confirm"
        label={busy ? t('profile.deleting') : t('profile.yesDeleteAccount')}
        kind="danger"
        disabled={busy || (needsPassword && !password)}
        onPress={() => { void confirm(); }}
      />
      <Btn label={t('profile.cancel')} kind="ghost" disabled={busy} onPress={onCancel} />
    </Sheet>
  );
}

export function QueueScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const queue = useApp((s) => s.queue);
  const leave = useApp((s) => s.leaveQueue);
  return (
    <Hall>
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <GoldTitle title={t('matchmaking.searching')} />
        <GlassCard>
          <Text style={styles.p}>
            {(queue?.players ?? 1) === 1
              ? t('matchmaking.playerInQueue')
              : t('matchmaking.playersInQueue', { count: queue?.players ?? 1 })}
          </Text>
          <Text style={styles.p}>{t('matchmaking.startingSoon')}</Text>
        </GlassCard>
        <Btn label={t('matchmaking.cancel')} kind="ghost" onPress={() => { void leave(); }} />
      </View>
    </Hall>
  );
}

/**
 * Solid sheet with a dimmed backdrop, like Settings. A glass card here let the hand and
 * table show through on iOS 26 and made the rows and Close hard to read.
 */
export function ScoreHistorySheet({ history, myTeam, onClose }: { history: RoundHistoryEntry[]; myTeam: number; onClose: () => void }) {
  const t = useT();
  const { height } = useWindowDimensions();
  return (
    <Sheet onClose={onClose}>
      <Text style={styles.sheetTitle}>{t('score.scoreHistory')}</Text>
      <ScrollView style={{ maxHeight: height * 0.45 }} contentContainerStyle={styles.rounds}>
        {history.length === 0 && <Text style={styles.empty}>{t('score.noRounds')}</Text>}
        {history.map((entry) => (
          <Text key={entry.round} style={styles.p}>
            {t('score.round')} {entry.round}: {entry.teamScores[myTeam]} – {entry.teamScores[1 - myTeam]}
          </Text>
        ))}
      </ScrollView>
      <Btn label={t('score.close')} kind="gold" onPress={onClose} />
    </Sheet>
  );
}

export function InvitePopup() {
  const invite = useApp((s) => s.invite);
  const accept = useApp((s) => s.acceptInvite);
  const decline = useApp((s) => s.declineInvite);
  if (!invite) return null;
  return (
    <View style={styles.sheet}>
      <GlassCard>
        <Text style={styles.h}>{tr('friends.invitedYou', { name: invite.inviterName })}</Text>
        <Text style={styles.p}>{tr('waiting.room', { code: invite.roomCode })}</Text>
        <Btn label={tr('friends.accept')} kind="gold" onPress={accept} />
        <Btn label={tr('friends.reject')} kind="ghost" onPress={decline} />
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, gap: 14 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  h: { color: color.gold, fontFamily: 'Georgia', fontSize: 22 },
  p: { color: color.text, fontSize: 16, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  rank: { color: color.gold, width: 28, fontWeight: '700' },
  name: { color: color.text, fontSize: 16, flexShrink: 1 },
  meta: { color: color.textDim, fontSize: 13 },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: 'rgba(15,52,96,0.55)', color: color.text, paddingHorizontal: 14, fontSize: 17 },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatar: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,52,96,0.45)' },
  avatarOn: { borderWidth: 1, borderColor: color.gold },
  emoji: { fontSize: 22 },
  sheet: { position: 'absolute', left: 16, right: 16, bottom: 40 },
  sheetTitle: { color: color.gold, fontFamily: greekFont, fontSize: 22, textAlign: 'center' },
  rounds: { gap: 4, paddingVertical: 4 },
  empty: { color: color.textDim, fontSize: 16, textAlign: 'center' },
  warn: { color: color.text, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  error: { color: color.danger, fontSize: 15, textAlign: 'center', fontWeight: '600' },
});
