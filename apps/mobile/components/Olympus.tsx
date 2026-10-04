import type { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { color, greekFont, radius } from '@/lib/theme';
import { GlassSurface } from './GlassSurface';

/** Repeating Greek key, drawn so the glass above it has a gold edge to bend. */
export function Meander({ style }: { style?: StyleProp<ViewStyle> }) {
  const { width } = useWindowDimensions();
  const n = Math.ceil(width / 22) + 1;
  return (
    <View style={[styles.meander, style]}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={styles.key}>
          <View style={[styles.bar, { top: 0, left: 0, right: 5, height: 2 }]} />
          <View style={[styles.bar, { top: 0, right: 5, width: 2, height: 8 }]} />
          <View style={[styles.bar, { top: 6, left: 5, right: 0, height: 2 }]} />
          <View style={[styles.bar, { top: 6, left: 5, width: 2, height: 8 }]} />
        </View>
      ))}
    </View>
  );
}

export function Column({ side }: { side: 'left' | 'right' }) {
  return (
    <View pointerEvents="none" style={[styles.column, side === 'left' ? { left: 8 } : { right: 8 }]}>
      <View style={styles.capital} />
      <View style={styles.shaft} />
      <View style={styles.capital} />
    </View>
  );
}

export function Hall({ children }: { children: ReactNode }) {
  return (
    <View style={styles.hall}>
      <View style={styles.glow} />
      <Column side="left" />
      <Column side="right" />
      <Meander style={styles.meanderTop} />
      {children}
    </View>
  );
}

export function GoldTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titles}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

/** A floating glass plate. Layout styles go on the plate; children sit inside the glass. */
export function GlassCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <GlassSurface style={style}>
      <View style={styles.card}>{children}</View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  hall: { flex: 1, backgroundColor: color.navy },
  glow: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: '#241848',
    opacity: 0.55,
  },
  column: { position: 'absolute', top: 80, bottom: 40, width: 18, alignItems: 'center' },
  capital: { width: 18, height: 10, backgroundColor: color.gold, opacity: 0.55, borderRadius: 2 },
  shaft: { flex: 1, width: 8, backgroundColor: color.gold, opacity: 0.28, marginVertical: 2 },
  meander: { height: 14, flexDirection: 'row', overflow: 'hidden' },
  meanderTop: { position: 'absolute', top: 54, left: 0, right: 0 },
  key: { width: 22, height: 14 },
  bar: { position: 'absolute', backgroundColor: color.gold },
  titles: { alignItems: 'center', gap: 4 },
  title: {
    color: color.gold,
    fontFamily: greekFont,
    fontSize: 48,
    letterSpacing: 8,
    fontWeight: '700',
  },
  sub: { color: color.gold, opacity: 0.75, fontFamily: greekFont, fontSize: 16, letterSpacing: 1 },
  card: { borderRadius: radius.lg, padding: 16, gap: 10 },
});
