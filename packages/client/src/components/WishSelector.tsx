import { NormalRank, getRankLabel } from '@cyprus/shared';
import { useGameStore } from '../stores/gameStore.js';
import { useT } from '../i18n.js';

const WISHABLE_RANKS = [
  NormalRank.TWO,
  NormalRank.THREE,
  NormalRank.FOUR,
  NormalRank.FIVE,
  NormalRank.SIX,
  NormalRank.SEVEN,
  NormalRank.EIGHT,
  NormalRank.NINE,
  NormalRank.TEN,
  NormalRank.JACK,
  NormalRank.QUEEN,
  NormalRank.KING,
  NormalRank.ACE,
];

export function WishSelector() {
  const wish = useGameStore((s) => s.wish);
  const t = useT();

  return (
    <div className="wish-selector">
      <p className="info">{t('game.playedMahjong')}</p>
      <div className="wish-grid">
        {WISHABLE_RANKS.map((rank) => (
          <button
            key={rank}
            className="btn btn-small wish-btn"
            onClick={() => wish(rank)}
          >
            {getRankLabel(rank)}
          </button>
        ))}
      </div>
    </div>
  );
}
