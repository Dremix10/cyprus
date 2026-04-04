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

function DragonArt({ small }: { small?: boolean }) {
  const s = small ? 0.65 : 1;
  return (
    <svg width={40 * s} height={50 * s} viewBox="0 0 40 50" fill="none">
      {/* Dragon body */}
      <path d="M20 5 C28 5 32 12 30 20 C28 28 24 30 22 38 C21 42 20 45 20 45 C20 45 19 42 18 38 C16 30 12 28 10 20 C8 12 12 5 20 5Z" fill="#c0392b" stroke="#8b0000" strokeWidth="1"/>
      {/* Wings */}
      <path d="M10 20 C6 14 2 16 3 12 C4 8 8 10 12 14" fill="#e74c3c" stroke="#8b0000" strokeWidth="0.8"/>
      <path d="M30 20 C34 14 38 16 37 12 C36 8 32 10 28 14" fill="#e74c3c" stroke="#8b0000" strokeWidth="0.8"/>
      {/* Eye */}
      <circle cx="17" cy="13" r="1.5" fill="#ffd700"/>
      <circle cx="23" cy="13" r="1.5" fill="#ffd700"/>
      <circle cx="17" cy="13" r="0.7" fill="#333"/>
      <circle cx="23" cy="13" r="0.7" fill="#333"/>
      {/* Horns */}
      <path d="M15 8 L13 3 L17 7" fill="#8b0000"/>
      <path d="M25 8 L27 3 L23 7" fill="#8b0000"/>
      {/* Fire breath */}
      <path d="M17 17 C18 20 20 22 20 22 C20 22 22 20 23 17" fill="#ffd700" opacity="0.7"/>
    </svg>
  );
}

function PhoenixArt({ small }: { small?: boolean }) {
  const s = small ? 0.65 : 1;
  return (
    <svg width={40 * s} height={50 * s} viewBox="0 0 40 50" fill="none">
      {/* Body */}
      <ellipse cx="20" cy="28" rx="8" ry="10" fill="#ff6b35" stroke="#cc4400" strokeWidth="1"/>
      {/* Head */}
      <circle cx="20" cy="14" r="6" fill="#ff8c42" stroke="#cc4400" strokeWidth="1"/>
      {/* Crest feathers */}
      <path d="M20 8 C18 2 16 0 17 4 C15 1 13 0 15 5" stroke="#ff0000" strokeWidth="1.2" fill="none"/>
      <path d="M20 8 C20 2 20 0 20 4" stroke="#ff0000" strokeWidth="1.2" fill="none"/>
      <path d="M20 8 C22 2 24 0 23 4 C25 1 27 0 25 5" stroke="#ff0000" strokeWidth="1.2" fill="none"/>
      {/* Eye */}
      <circle cx="18" cy="13" r="1.2" fill="#333"/>
      <circle cx="22" cy="13" r="1.2" fill="#333"/>
      {/* Beak */}
      <path d="M19 16 L20 19 L21 16" fill="#ffd700" stroke="#cc8800" strokeWidth="0.5"/>
      {/* Wings */}
      <path d="M12 28 C6 22 3 26 4 30 C5 34 8 32 12 30" fill="#ff4500" stroke="#cc2200" strokeWidth="0.8"/>
      <path d="M28 28 C34 22 37 26 36 30 C35 34 32 32 28 30" fill="#ff4500" stroke="#cc2200" strokeWidth="0.8"/>
      {/* Tail feathers */}
      <path d="M16 38 C14 44 12 48 14 46 C12 50 16 48 18 42" stroke="#ff0000" strokeWidth="1" fill="#ff4500"/>
      <path d="M20 38 C20 44 20 48 20 46" stroke="#ff0000" strokeWidth="1.2" fill="none"/>
      <path d="M24 38 C26 44 28 48 26 46 C28 50 24 48 22 42" stroke="#ff0000" strokeWidth="1" fill="#ff4500"/>
    </svg>
  );
}

function MahjongArt({ small }: { small?: boolean }) {
  const s = small ? 0.65 : 1;
  return (
    <svg width={40 * s} height={50 * s} viewBox="0 0 40 50" fill="none">
      {/* Mahjong tile background */}
      <rect x="6" y="5" width="28" height="40" rx="3" fill="#f0e6d0" stroke="#8b7355" strokeWidth="1.5"/>
      {/* Large "1" character - stylized */}
      <text x="20" y="30" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#c0392b" fontFamily="serif">1</text>
      {/* Small decorative circles (like a mahjong dot) */}
      <circle cx="20" cy="38" r="3" fill="#c0392b" stroke="#8b0000" strokeWidth="0.8"/>
      {/* Top ornament */}
      <path d="M16 10 L20 7 L24 10" stroke="#8b7355" strokeWidth="1" fill="none"/>
    </svg>
  );
}

function DogArt({ small }: { small?: boolean }) {
  const s = small ? 0.65 : 1;
  return (
    <svg width={40 * s} height={50 * s} viewBox="0 0 40 50" fill="none">
      {/* Body */}
      <ellipse cx="20" cy="32" rx="10" ry="8" fill="#c49a6c" stroke="#8b6914" strokeWidth="1"/>
      {/* Head */}
      <circle cx="20" cy="18" r="8" fill="#d4a76a" stroke="#8b6914" strokeWidth="1"/>
      {/* Ears */}
      <path d="M12 14 C8 8 6 14 10 18" fill="#a0764a" stroke="#8b6914" strokeWidth="0.8"/>
      <path d="M28 14 C32 8 34 14 30 18" fill="#a0764a" stroke="#8b6914" strokeWidth="0.8"/>
      {/* Eyes */}
      <circle cx="17" cy="16" r="2" fill="#fff" stroke="#333" strokeWidth="0.5"/>
      <circle cx="23" cy="16" r="2" fill="#fff" stroke="#333" strokeWidth="0.5"/>
      <circle cx="17" cy="16" r="1" fill="#333"/>
      <circle cx="23" cy="16" r="1" fill="#333"/>
      {/* Nose */}
      <ellipse cx="20" cy="21" rx="2" ry="1.5" fill="#333"/>
      {/* Mouth */}
      <path d="M18 23 C19 24 21 24 22 23" stroke="#333" strokeWidth="0.8" fill="none"/>
      {/* Legs */}
      <rect x="13" y="38" width="3" height="6" rx="1.5" fill="#c49a6c" stroke="#8b6914" strokeWidth="0.8"/>
      <rect x="24" y="38" width="3" height="6" rx="1.5" fill="#c49a6c" stroke="#8b6914" strokeWidth="0.8"/>
      {/* Tail */}
      <path d="M30 30 C34 28 36 24 34 22" stroke="#c49a6c" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

const SPECIAL_CARDS: Record<SpecialCardType, { label: string; color: string; bg: string; Art: React.FC<{ small?: boolean }> }> = {
  [SpecialCardType.MAHJONG]: { label: '1', color: '#333', bg: '#f5f5dc', Art: MahjongArt },
  [SpecialCardType.DOG]: { label: 'Dog', color: '#333', bg: '#d4c4a8', Art: DogArt },
  [SpecialCardType.PHOENIX]: { label: 'Ph', color: '#c0392b', bg: '#ffeaa7', Art: PhoenixArt },
  [SpecialCardType.DRAGON]: { label: 'Dr', color: '#fff', bg: '#2c3e50', Art: DragonArt },
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
    const display = SPECIAL_CARDS[card.specialType];
    return (
      <div
        className={`card special-card special-${card.specialType.toLowerCase()} ${selected ? 'card-selected' : ''} ${isSmall ? 'card-sm' : ''}`}
        style={{ background: display.bg, color: display.color }}
        onClick={onClick}
      >
        <div className="card-corner special-corner">{display.label}</div>
        <div className="card-center">
          <display.Art small={isSmall} />
        </div>
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
