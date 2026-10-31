import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius } from '@/lib/theme';

/**
 * A SOLID panel that slides up over the table (it holds choices, so it is content, not glass).
 * `avoidKeyboard` lifts it above the keyboard, for sheets with a text field.
 */
export function Sheet({ children, onClose, avoidKeyboard }: { children: ReactNode; onClose?: () => void; avoidKeyboard?: boolean }) {
  const insets = useSafeAreaInsets();
  const Scrim = avoidKeyboard ? KeyboardAvoidingView : View;
  return (
    <Scrim behavior="padding" style={styles.scrim}>
      {onClose ? (
        // Tap-outside for sighted users. Hidden from VoiceOver: the sheet has its own Close button.
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} importantForAccessibility="no" />
      ) : null}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>{children}</View>
    </Scrim>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    padding: 20,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    zIndex: 1,
  },
});
