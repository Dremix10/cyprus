import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
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
      <Image
        source={require('../assets/images/zeus.png')}
        style={styles.zeus}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View pointerEvents="none" style={styles.shade} />
      <Column side="left" />
      <Column side="right" />
      <Meander style={styles.meanderTop} />
      {children}
    </View>
  );
}

export function GoldTitle({ title, subtitle, hero }: { title: string; subtitle?: string; hero?: boolean }) {
  return (
    <View style={styles.titles}>
      <Text style={[styles.title, hero && styles.hero]} adjustsFontSizeToFit numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

/** A floating glass plate. Layout styles go on the plate; children sit inside the glass. */
export function GlassCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <GlassSurface style={style}>
      <View collapsable={false} style={styles.card}>{children}</View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  hall: { flex: 1, backgroundColor: '#0D1520' },
  zeus: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0.55,
  },
  shade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,16,30,0.35)',
  },
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
  column: {
    position: 'absolute',
    top: 80,
    bottom: 40,
    width: 18,
    alignItems: 'center',
    opacity: 0.6,
  },
  capital: {
    width: 18,
    height: 10,
    backgroundColor: color.gold,
    opacity: 0.55,
    borderRadius: 2,
  },
  shaft: {
    flex: 1,
    width: 8,
    backgroundColor: color.gold,
    opacity: 0.28,
    marginVertical: 2,
  },
  meander: { height: 14, flexDirection: 'row', overflow: 'hidden' },
  meanderTop: { position: 'absolute', top: 54, left: 0, right: 0 },
  key: { width: 22, height: 14 },
  bar: { position: 'absolute', backgroundColor: color.gold },
  titles: { alignItems: 'center', gap: 4 },
  title: {
    color: color.gold,
    fontFamily: greekFont,
    fontSize: 36,
    letterSpacing: 3,
    fontWeight: '700',
  },
  sub: {
    color: color.gold,
    opacity: 0.75,
    fontFamily: greekFont,
    fontSize: 16,
    letterSpacing: 1,
  },
  hero: {
    fontSize: 56,
    letterSpacing: 9,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  card: { borderRadius: radius.lg, padding: 20, gap: 12 },
});
