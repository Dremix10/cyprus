import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassSurface } from './GlassSurface';
import { color, radius } from '@/lib/theme';
import { useApp } from '@/lib/store';

/** Floating status: connection trouble, maintenance, and transient notices (toasts). */
export function StatusOverlay() {
  const conn = useApp((s) => s.conn);
  const ready = useApp((s) => s.ready);
  const maintenance = useApp((s) => s.maintenance);
  const notice = useApp((s) => s.notice);
  const insets = useSafeAreaInsets();
  const offline = conn !== 'connected' && ready;
  const label = maintenance ?? (offline ? 'Connection lost. Reconnecting…' : null);
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      {label && (
        <GlassSurface style={styles.pill} tint={offline ? 'rgba(229,72,77,0.35)' : undefined}>
          <View style={styles.row}>
            {offline && <ActivityIndicator size="small" color={color.text} />}
            <Text style={styles.text}>{label}</Text>
          </View>
        </GlassSurface>
      )}
      {notice && (
        <GlassSurface style={styles.pill} tint={notice.tone === 'error' ? 'rgba(229,72,77,0.35)' : notice.tone === 'warn' ? 'rgba(242,193,78,0.3)' : undefined}>
          <Text style={styles.text}>{notice.text}</Text>
        </GlassSurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 50 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, maxWidth: '100%' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  text: { color: color.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
