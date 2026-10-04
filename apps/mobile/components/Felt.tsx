import { memo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { color } from '@/lib/theme';

const GLYPHS = ['♠', '♥', '♣', '♦'];

/**
 * Full-bleed table felt with a printed suit pattern. Liquid Glass only shows what is
 * under it (it lenses and refracts), so the floating bars need texture behind them;
 * over a flat colour the glass reads as a plain dark pill.
 */
export const Felt = memo(function Felt() {
  const { width, height } = useWindowDimensions();
  const step = 46;
  const cols = Math.ceil(width / step) + 1;
  const rows = Math.ceil(height / step) + 1;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = GLYPHS[(r + c * 3) % 4];
      cells.push(
        <Text
          key={`${r}-${c}`}
          style={[
            styles.glyph,
            { left: c * step + (r % 2 ? step / 2 : 0) - step / 2, top: r * step, color: g === '♥' || g === '♦' ? '#F2A38A' : '#CDEBDB' },
          ]}
        >
          {g}
        </Text>,
      );
    }
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.felt }]}>
      <View style={[styles.glow, { width: width * 1.4, height: width * 1.4, left: -width * 0.2, top: height * 0.22 }]} />
      {cells}
    </View>
  );
});

const styles = StyleSheet.create({
  glyph: { position: 'absolute', fontSize: 22, opacity: 0.13 },
  glow: { position: 'absolute', borderRadius: 9999, backgroundColor: '#1B7A50', opacity: 0.55 },
});
