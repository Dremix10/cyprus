import { memo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { color } from '@/lib/theme';

const GLYPHS = ['♠', '♥', '♣', '♦'];

/**
 * Night-blue hall, same family as the website's table. A gold meander and pale suits
 * sit behind the floating bars so Liquid Glass has something to lens.
 */
export const Felt = memo(function Felt() {
  const { width, height } = useWindowDimensions();
  const step = 52;
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
            {
              left: c * step + (r % 2 ? step / 2 : 0) - step / 2,
              top: r * step,
              color: g === '♥' || g === '♦' ? '#E94560' : '#C9A84C',
            },
          ]}
        >
          {g}
        </Text>,
      );
    }
  }
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.feltDeep }]}>
      <View style={[styles.glow, { width: width * 1.2, height: width * 0.9, left: -width * 0.1, top: height * 0.18 }]} />
      {cells}
      <View style={[styles.meander, { top: 0 }]} />
      <View style={[styles.meander, { bottom: 0 }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  glyph: { position: 'absolute', fontSize: 18, opacity: 0.16 },
  glow: { position: 'absolute', borderRadius: 9999, backgroundColor: '#1A1A3E', opacity: 0.9 },
  meander: { position: 'absolute', left: 0, right: 0, height: 10, backgroundColor: 'rgba(201,168,76,0.28)' },
});
