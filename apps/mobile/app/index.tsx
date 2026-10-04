import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { Lobby } from '@/components/Lobby';
import { WaitingRoom } from '@/components/WaitingRoom';
import { Table } from '@/components/Table';
import { RulesSheet } from '@/components/RulesSheet';
import { StatusOverlay } from '@/components/ConnectionBar';
import { color } from '@/lib/theme';
import { socket } from '@/lib/socket';
import { useApp } from '@/lib/store';

export default function Home() {
  const view = useApp((s) => s.view);
  const ready = useApp((s) => s.ready);
  const [rules, setRules] = useState(false);

  // Coming back from the background: iOS may have dropped the socket. Reconnect + resync.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (!socket.connected) socket.connect();
      else useApp.getState().resync();
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root}>
      {!ready && view === 'lobby' ? (
        <View style={styles.boot}>
          <ActivityIndicator color={color.text} />
        </View>
      ) : rules ? (
        <RulesSheet onClose={() => setRules(false)} />
      ) : view === 'lobby' ? (
        <Lobby onRules={() => setRules(true)} />
      ) : view === 'waiting' ? (
        <WaitingRoom />
      ) : (
        <Table />
      )}
      <StatusOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.feltDeep },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
