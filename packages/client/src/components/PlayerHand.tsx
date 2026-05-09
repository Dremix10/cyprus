import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Card, ReceivedCard } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';

interface PlayerHandProps {
  cards: Card[];
  selectedCards: Set<string>;
  onToggle: (cardId: string) => void;
  interactive?: boolean;
  lockedCards?: Set<string>;
  receivedCards?: ReceivedCard[];
}

export function PlayerHand({ cards, selectedCards, onToggle, interactive = true, lockedCards, receivedCards }: PlayerHandProps) {
  const pointerStart = useRef<{ cardId: string; x: number; y: number } | null>(null);
  const receivedMap = receivedCards
    ? new Map(receivedCards.map((rc) => [rc.cardId, rc.fromTeammate]))
    : null;

  const canToggle = (cardId: string) => interactive && !lockedCards?.has(cardId);

  const handlePointerDown = (cardId: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!canToggle(cardId) || !event.isPrimary) return;
    pointerStart.current = { cardId, x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (cardId: string, event: PointerEvent<HTMLButtonElement>) => {
    if (!canToggle(cardId) || !event.isPrimary) return;
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.cardId !== cardId) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12) return;
    event.preventDefault();
    onToggle(cardId);
  };

  const handleKeyDown = (cardId: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!canToggle(cardId)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onToggle(cardId);
  };

  return (
    <div className="player-hand">
      {cards.map((card, i) => {
        const offset = cards.length > 1 ? (i - (cards.length - 1) / 2) * 2 : 0;
        const received = receivedMap?.get(card.id);
        const isSelected = selectedCards.has(card.id);
        const isLocked = !!lockedCards?.has(card.id);
        const isToggleable = canToggle(card.id);
        return (
          <div
            key={card.id}
            className={`hand-card-wrapper ${isSelected ? 'hand-card-wrapper-selected' : ''} ${isLocked ? 'hand-card-wrapper-locked' : ''}`}
            style={{
              '--fan-offset': `${offset}deg`,
              '--card-index': i,
            } as React.CSSProperties}
          >
            {received !== undefined && (
              <span className={`received-dot ${received ? 'received-teammate' : 'received-opponent'}`} />
            )}
            <button
              type="button"
              className="hand-card-hitbox"
              disabled={!isToggleable}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? 'Deselect' : 'Select'} card ${card.id}`}
              onPointerDown={(event) => handlePointerDown(card.id, event)}
              onPointerUp={(event) => handlePointerUp(card.id, event)}
              onPointerCancel={() => { pointerStart.current = null; }}
              onKeyDown={(event) => handleKeyDown(card.id, event)}
            >
              <CardComponent card={card} selected={isSelected} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
