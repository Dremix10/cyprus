import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { color, radius } from '@/lib/theme';

type Kind = 'primary' | 'gold' | 'ghost' | 'danger';

export function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
  haptic = 'light',
  small,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: Kind;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'medium' | 'none';
  small?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (haptic !== 'none')
          void Haptics.impactAsync(
            haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
          ).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        kind === 'primary' && styles.primary,
        kind === 'gold' && styles.gold,
        kind === 'ghost' && styles.ghost,
        kind === 'danger' && styles.danger,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, small && styles.textSmall, kind === 'gold' && { color: color.goldInk }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 44, paddingHorizontal: 16 },
  primary: { backgroundColor: '#1F9D63' },
  gold: { backgroundColor: color.gold },
  ghost: { backgroundColor: 'rgba(255,255,255,0.12)' },
  danger: { backgroundColor: color.danger },
  disabled: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  text: { color: color.white, fontSize: 17, fontWeight: '700' },
  textSmall: { fontSize: 15 },
});
