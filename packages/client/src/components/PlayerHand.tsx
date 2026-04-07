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
  const receivedMap = receivedCards
    ? new Map(receivedCards.map((rc) => [rc.cardId, rc.fromTeammate]))
    : null;

  return (
    <div className="player-hand">
      {cards.map((card, i) => {
        const offset = cards.length > 1 ? (i - (cards.length - 1) / 2) * 2 : 0;
        const received = receivedMap?.get(card.id);
        return (
          <div
            key={card.id}
            className="hand-card-wrapper"
            style={{
              '--fan-offset': `${offset}deg`,
              '--card-index': i,
            } as React.CSSProperties}
          >
            {received !== undefined && (
              <span className={`received-dot ${received ? 'received-teammate' : 'received-opponent'}`} />
            )}
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
