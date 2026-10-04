import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { Lobby } from '@/components/Lobby';
import { WaitingRoom } from '@/components/WaitingRoom';
import { Table } from '@/components/Table';
import { AuthPanel } from '@/components/AuthPanel';
import { FriendsScreen, InvitePopup, LeaderboardScreen, LiveGamesScreen, ProfileScreen, QueueScreen, TutorialScreen } from '@/components/MoreScreens';
import { StatusOverlay } from '@/components/ConnectionBar';
import { color } from '@/lib/theme';
import { socket } from '@/lib/socket';
import { useApp } from '@/lib/store';
import { useAuth } from '@/lib/authStore';

type Sheet = null | 'auth' | 'tutorial' | 'leaderboard' | 'profile' | 'friends' | 'live';

export default function Home() {
  const view = useApp((s) => s.view);
  const ready = useApp((s) => s.ready);
  const user = useAuth((s) => s.user);
  const setNickname = useApp((s) => s.setNickname);
  const nickname = useApp((s) => s.nickname);
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    if (user && !nickname.trim()) setNickname(user.displayName.slice(0, 20));
  }, [user, nickname, setNickname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (!socket.connected) socket.connect();
      else useApp.getState().resync();
    });
    return () => sub.remove();
  }, []);

  const close = () => setSheet(null);
  let body = <Lobby
    onRules={() => setSheet('tutorial')}
    onAuth={() => setSheet('auth')}
    onLeaderboard={() => setSheet('leaderboard')}
    onFriends={() => setSheet('friends')}
    onLive={() => setSheet('live')}
    onProfile={() => setSheet('profile')}
  />;
  if (!ready && view === 'lobby' && !sheet) {
    body = <View style={styles.boot}><ActivityIndicator color={color.gold} /></View>;
  } else if (sheet === 'auth') body = <AuthPanel onClose={close} />;
  else if (sheet === 'tutorial') body = <TutorialScreen onClose={close} />;
  else if (sheet === 'leaderboard') body = <LeaderboardScreen onClose={close} />;
  else if (sheet === 'friends') body = <FriendsScreen onClose={close} />;
  else if (sheet === 'live') body = <LiveGamesScreen onClose={close} />;
  else if (sheet === 'profile') body = <ProfileScreen onClose={close} />;
  else if (view === 'queue') body = <QueueScreen />;
  else if (view === 'waiting') body = <WaitingRoom />;
  else if (view === 'game') body = <Table />;

  return (
    <View style={styles.root}>
      {body}
      <InvitePopup />
      <StatusOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.navy },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.navy },
});
