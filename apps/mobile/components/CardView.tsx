import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Suit, SpecialCardType, getRankLabel, type Card } from '@cyprus/shared';
import { color } from '@/lib/theme';

// Suits differ by SHAPE as well as colour (same glyphs as the website).
const SUIT_GLYPH: Record<Suit, string> = {
  [Suit.JADE]: '♣',
  [Suit.PAGODA]: '♦',
  [Suit.STAR]: '♥',
  [Suit.SWORD]: '♠',
};
const SUIT_COLOR: Record<Suit, string> = {
  [Suit.JADE]: '#12874E',
  [Suit.PAGODA]: '#1F6FD1',
  [Suit.STAR]: '#D6332F',
  [Suit.SWORD]: '#23262B',
};

const SPECIAL: Record<SpecialCardType, { corner: string; name: string; glyph: string; bg: string; ink: string }> = {
  [SpecialCardType.MAHJONG]: { corner: '1', name: 'Mahjong', glyph: '🀄', bg: '#F6E9C9', ink: '#8A1C1C' },
  [SpecialCardType.DOG]: { corner: 'Dog', name: 'Dog', glyph: '🐕', bg: '#D9C3A0', ink: '#3E2A10' },
  [SpecialCardType.PHOENIX]: { corner: 'Ph', name: 'Phoenix', glyph: '🦅', bg: '#FFD9A0', ink: '#B2350F' },
  [SpecialCardType.DRAGON]: { corner: 'Dr', name: 'Dragon', glyph: '🐉', bg: '#1D2B3A', ink: '#FFFFFF' },
};

export const CARD_ASPECT = 1.42;

type Props = { card: Card; width: number; selected?: boolean; dim?: boolean };

/** A solid playing card. Never glass. Width drives everything. */
export const CardView = memo(function CardView({ card, width, selected, dim }: Props) {
  const height = Math.round(width * CARD_ASPECT);
  const rankSize = Math.round(width * 0.36);
  const suitSize = Math.round(width * 0.32);
  let bg: string = color.cardFace;
  let ink: string;
  let corner: string;
  let sub: string;
  let centre: string;
  let name: string | null = null;
  if (card.type === 'normal') {
    ink = SUIT_COLOR[card.suit];
    corner = getRankLabel(card.rank);
    sub = SUIT_GLYPH[card.suit];
    centre = SUIT_GLYPH[card.suit];
  } else {
    const s = SPECIAL[card.specialType];
    bg = s.bg;
    ink = s.ink;
    corner = s.corner;
    sub = s.glyph;
    centre = s.glyph;
    name = s.name;
  }
  return (
    <View
      style={[
        styles.card,
        { width, height, backgroundColor: bg, borderRadius: Math.max(5, width * 0.12) },
        selected && styles.selected,
        dim && styles.dim,
      ]}
    >
      <Text style={[styles.corner, { color: ink, fontSize: rankSize, lineHeight: rankSize + 2 }]} numberOfLines={1}>
        {corner}
      </Text>
      <Text style={{ color: ink, fontSize: suitSize, lineHeight: suitSize + 2 }}>{sub}</Text>
      {width >= 48 && (
        <View style={styles.centre} pointerEvents="none">
          <Text style={{ color: ink, fontSize: width * 0.55, opacity: card.type === 'normal' ? 0.16 : 0.9 }}>{centre}</Text>
          {name && width >= 56 && (
            <Text style={{ color: ink, fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 }}>{name.toUpperCase()}</Text>
          )}
        </View>
      )}
    </View>
  );
});

export function CardBack({ width }: { width: number }) {
  const height = Math.round(width * CARD_ASPECT);
  return <View style={[styles.card, { width, height, backgroundColor: color.cardBack, borderRadius: width * 0.12, borderColor: '#B0485A' }]} />;
}

const styles = StyleSheet.create({
  card: {
    paddingLeft: 3,
    paddingTop: 2,
    borderWidth: 1,
    borderColor: color.cardEdge,
    overflow: 'hidden',
  },
  corner: { fontWeight: '800' },
  centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: color.gold, borderWidth: 2.5 },
  dim: { opacity: 0.45 },
});
