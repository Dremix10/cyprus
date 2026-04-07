import type { Card } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';

interface PlayerHandProps {
  cards: Card[];
  selectedCards: Set<string>;
  onToggle: (cardId: string) => void;
  interactive?: boolean;
  lockedCards?: Set<string>;
}

export function PlayerHand({ cards, selectedCards, onToggle, interactive = true, lockedCards }: PlayerHandProps) {
  return (
    <div className="player-hand">
      {cards.map((card, i) => {
        const offset = cards.length > 1 ? (i - (cards.length - 1) / 2) * 2 : 0;
        return (
          <div
            key={card.id}
            className="hand-card-wrapper"
            style={{
              '--fan-offset': `${offset}deg`,
              '--card-index': i,
            } as React.CSSProperties}
          >
            <CardComponent
              card={card}
              selected={selectedCards.has(card.id)}
              onClick={interactive && !lockedCards?.has(card.id) ? () => onToggle(card.id) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
