/**
 * A floating bar (nav bar, turn banner, action bar, toast): Liquid Glass on iOS 26,
 * a blur on older iOS, a solid surface otherwise. Same rules as Anna Nails'
 * glass-surface.tsx: glass is for things that FLOAT above the table, never for cards
 * or the table itself; no backgroundColor and no opacity below 1 on the GlassView
 * or any parent (it turns grey).
 */
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color } from '@/lib/theme';

const LIQUID_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AccessibilityInfo.isReduceTransparencyEnabled().then(setOn).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

export function GlassSurface({
  style,
  children,
  tint,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  tint?: string;
}) {
  const reduce = useReduceTransparency();
  const inner = LIQUID_GLASS && !reduce ? (
    <GlassView glassEffectStyle="regular" tintColor={tint ?? 'rgba(201,168,76,0.16)'} style={style}>
      {children}
    </GlassView>
  ) : Platform.OS === 'ios' && !reduce ? (
    <BlurView intensity={80} tint="systemChromeMaterialDark" style={[style, styles.clip]}>
      {children}
    </BlurView>
  ) : (
    <View style={[style, styles.solid]}>{children}</View>
  );
  return <View style={styles.rim}>{inner}</View>;
}

const styles = StyleSheet.create({
  rim: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    borderRadius: 22,
  },
  clip: { overflow: 'hidden' },
  solid: { backgroundColor: color.surface },
});
