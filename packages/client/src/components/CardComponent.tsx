import type { Card } from '@cyprus/shared';
import { Suit, SpecialCardType, getRankLabel } from '@cyprus/shared';

const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.JADE]: '\u2663',    // club (green)
  [Suit.PAGODA]: '\u2666',  // diamond (blue)
  [Suit.STAR]: '\u2665',    // heart (red)
  [Suit.SWORD]: '\u2660',   // spade (black)
};

const SUIT_COLORS: Record<Suit, string> = {
  [Suit.JADE]: '#2ecc71',
  [Suit.PAGODA]: '#3498db',
  [Suit.STAR]: '#e74c3c',
  [Suit.SWORD]: '#333',
};

const SPECIAL_DISPLAY: Record<SpecialCardType, { label: string; color: string; bg: string }> = {
  [SpecialCardType.MAHJONG]: { label: '1', color: '#333', bg: '#f5f5dc' },
  [SpecialCardType.DOG]: { label: 'Dog', color: '#333', bg: '#d4c4a8' },
  [SpecialCardType.PHOENIX]: { label: 'Ph', color: '#c0392b', bg: '#ffeaa7' },
  [SpecialCardType.DRAGON]: { label: 'Dr', color: '#fff', bg: '#2c3e50' },
};

interface CardComponentProps {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
}

export function CardComponent({ card, selected, onClick, size = 'normal' }: CardComponentProps) {
  const isSmall = size === 'small';

  if (card.type === 'special') {
    const display = SPECIAL_DISPLAY[card.specialType];
    return (
      <div
        className={`card ${selected ? 'card-selected' : ''} ${isSmall ? 'card-sm' : ''}`}
        style={{ background: display.bg, color: display.color }}
        onClick={onClick}
      >
        <div className="card-corner">{display.label}</div>
        <div className="card-center">{display.label}</div>
      </div>
    );
  }

  const suit = card.suit;
  const symbol = SUIT_SYMBOLS[suit];
  const color = SUIT_COLORS[suit];
  const label = getRankLabel(card.rank);

  return (
    <div
      className={`card ${selected ? 'card-selected' : ''} ${isSmall ? 'card-sm' : ''}`}
      style={{ color }}
      onClick={onClick}
    >
      <div className="card-corner">
        <span className="card-rank">{label}</span>
        <span className="card-suit">{symbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-lg">{symbol}</span>
      </div>
    </div>
  );
}

export function CardBack({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return (
    <div
      className={`card card-back ${size === 'small' ? 'card-sm' : ''}`}
    />
  );
}
