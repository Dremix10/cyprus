import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Card } from '@cyprus/shared';
import { CardView, CARD_ASPECT } from './CardView';

const SIDE = 12;

/**
 * The hand: one row, never scrolls. Cards overlap so every card shows a slice that is
 * at least 22 pt wide (the tap target), with taller hit areas. Selected cards lift.
 */
export function Hand({
  cards,
  selected,
  onToggle,
  disabled,
  dimmed,
  cardWidth = 58,
}: {
  cards: Card[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  dimmed?: Set<string>;
  cardWidth?: number;
}) {
  const { width: screen } = useWindowDimensions();
  const avail = screen - SIDE * 2;
  const n = cards.length;
  const slice = n <= 1 ? cardWidth : Math.min(cardWidth, Math.max(22, (avail - cardWidth) / (n - 1)));
  const total = n <= 1 ? cardWidth : slice * (n - 1) + cardWidth;
  const height = Math.round(cardWidth * CARD_ASPECT);
  const lift = 16;
  return (
    <View style={{ height: height + lift + 6, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: total, height: height + lift }}>
        {cards.map((card, i) => {
          const isSel = selected.includes(card.id);
          const w = i === n - 1 ? cardWidth : slice;
          return (
            <Pressable
              key={card.id}
              testID={`hand-${i}`}
              disabled={disabled}
              hitSlop={{ top: 14, bottom: 14 }}
              accessibilityRole="button"
              accessibilityLabel={`${card.id.replace('_', ' ')}${isSel ? ', selected' : ''}`}
              onPress={() => {
                void Haptics.selectionAsync().catch(() => {});
                onToggle(card.id);
              }}
              style={[styles.slot, { left: i * slice, width: w, height: height + lift }]}
            >
              <View style={{ position: 'absolute', top: isSel ? 0 : lift, left: 0 }}>
                <CardView card={card} width={cardWidth} selected={isSel} dim={dimmed?.has(card.id)} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', top: 0 },
});
