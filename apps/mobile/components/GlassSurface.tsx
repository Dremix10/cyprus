/** Native glass floats over the artwork. Keep its own background transparent
 * and ancestors fully opaque; UIKit draws the lens and rounded edges. Older iOS
 * uses system blur, with a solid surface when Reduce Transparency is enabled.
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
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then(setOn)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

export function GlassSurface({
  style,
  children,
  tint,
  interactive = false,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  tint?: string;
  interactive?: boolean;
}) {
  const reduce = useReduceTransparency();
  const corner = StyleSheet.flatten(style)?.borderRadius ?? 22;
  const inner =
    LIQUID_GLASS && !reduce ? (
      <View collapsable={false} style={[styles.glass, style]}>
        {/* Keep the native effect stable while ordinary React Native controls
            above it change as turns and available actions update. */}
        <GlassView
          pointerEvents="none"
          glassEffectStyle="clear"
          colorScheme="dark"
          isInteractive={interactive}
          tintColor={tint}
          style={[StyleSheet.absoluteFill, { borderRadius: corner }]}
        />
        {children}
      </View>
    ) : Platform.OS === 'ios' && !reduce ? (
      <BlurView intensity={80} tint="systemChromeMaterialDark" style={[style, styles.clip]}>
        {children}
      </BlurView>
    ) : (
      <View style={[styles.clip, style, styles.solid]}>{children}</View>
    );
  return inner;
}

const styles = StyleSheet.create({
  glass: { borderRadius: 22 },
  clip: { overflow: 'hidden', borderRadius: 22 },
  solid: { backgroundColor: color.surface },
});
