import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Suit, SpecialCardType, SPECIAL_CARD_NAMES, getRankLabel, type Card } from '@cyprus/shared';
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
  [SpecialCardType.MAHJONG]: { corner: '1', name: SPECIAL_CARD_NAMES[SpecialCardType.MAHJONG], glyph: '1', bg: '#F6E9C9', ink: '#8A1C1C' },
  [SpecialCardType.DOG]: { corner: '🐕', name: SPECIAL_CARD_NAMES[SpecialCardType.DOG], glyph: '🐕', bg: '#D9C3A0', ink: '#3E2A10' },
  [SpecialCardType.PHOENIX]: { corner: '🦅', name: SPECIAL_CARD_NAMES[SpecialCardType.PHOENIX], glyph: '🦅', bg: '#FFD9A0', ink: '#B2350F' },
  [SpecialCardType.DRAGON]: { corner: '🐉', name: SPECIAL_CARD_NAMES[SpecialCardType.DRAGON], glyph: '🐉', bg: '#1D2B3A', ink: '#FFFFFF' },
};

export const CARD_ASPECT = 1.42;

type Props = { card: Card; width: number; selected?: boolean; dim?: boolean; peek?: number };

/**
 * A solid playing card. Never glass. Width drives everything.
 * `peek` is how much of the left edge stays uncovered when cards overlap (the hand, a played
 * run). When the next card covers part of it, a special card's name runs down that left strip
 * instead of across the bottom, where only "Σκ" of "Σκύλος" was left showing.
 */
export const CardView = memo(function CardView({ card, width, selected, dim, peek }: Props) {
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
  const cornerSize = card.type === 'normal' ? rankSize : Math.max(11, Math.round(width * 0.28));
  const showName = name !== null && width >= 40;
  const showCentre = card.type === 'normal' ? width >= 48 : width >= 36;
  const covered = peek !== undefined && peek < width - 2;
  // Side label: a box as long as the space under the corner glyph, turned 90° (reads top to
  // bottom) and centred under that glyph, inside the visible strip.
  const sideSize = Math.max(9, Math.min(12, width * 0.19));
  const sideTop = 3 + cornerSize + 4;
  const sideLen = height - sideTop - 4;
  const sideThick = Math.round(sideSize * 1.3);
  const sideMid = Math.min(3 + cornerSize / 2, (peek ?? width) - sideThick / 2 - 2);
  return (
    <View
      accessibilityLabel={name ?? `${corner}${sub}`}
      style={[
        styles.card,
        { width, height, backgroundColor: bg, borderRadius: Math.max(5, width * 0.12) },
        selected && styles.selected,
        dim && styles.dim,
      ]}
    >
      <Text
        style={[styles.corner, { color: ink, fontSize: cornerSize, lineHeight: cornerSize + 1 }]}
        numberOfLines={1}
      >
        {corner}
      </Text>
      {card.type === 'normal' && (
        <Text style={{ color: ink, fontSize: suitSize, lineHeight: suitSize + 2 }}>{sub}</Text>
      )}
      {showCentre && (
        <View style={styles.centre} pointerEvents="none">
          <Text style={{ color: ink, fontSize: width * (card.type === 'normal' ? 0.55 : 0.46), opacity: card.type === 'normal' ? 0.16 : 0.95 }}>
            {centre}
          </Text>
        </View>
      )}
      {showName && !covered && (
        <Text
          style={[styles.specialName, { color: ink, fontSize: Math.max(8, Math.min(11, width * 0.16)) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {name}
        </Text>
      )}
      {showName && covered && (
        <Text
          style={[
            styles.sideName,
            {
              color: ink,
              fontSize: sideSize,
              width: sideLen,
              height: sideThick,
              left: sideMid - sideLen / 2,
              top: sideTop + sideLen / 2 - sideThick / 2,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {name}
        </Text>
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
  specialName: {
    position: 'absolute',
    left: 1,
    right: 1,
    bottom: 2,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: -0.4,
    textTransform: 'none',
  },
  sideName: {
    position: 'absolute',
    fontWeight: '800',
    letterSpacing: -0.2,
    transform: [{ rotate: '90deg' }],
  },
  selected: { borderColor: color.gold, borderWidth: 2.5 },
  dim: { opacity: 0.45 },
});
