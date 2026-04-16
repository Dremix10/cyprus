import { useState } from 'react';

export function QuickGuideButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="quick-guide-btn" onClick={() => setOpen(true)} title="How to Play">
        ?
      </button>
      {open && <QuickGuide onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickGuide({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'combos' | 'specials' | 'rules'>('combos');

  return (
    <div className="quick-guide-overlay" onClick={onClose}>
      <div className="quick-guide" onClick={(e) => e.stopPropagation()}>
        <div className="quick-guide-header">
          <h3>Quick Reference</h3>
          <button className="quick-guide-close" onClick={onClose}>&times;</button>
        </div>

        <div className="quick-guide-tabs">
          <button className={tab === 'combos' ? 'active' : ''} onClick={() => setTab('combos')}>Combinations</button>
          <button className={tab === 'specials' ? 'active' : ''} onClick={() => setTab('specials')}>Special Cards</button>
          <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Key Rules</button>
        </div>

        <div className="quick-guide-content">
          {tab === 'combos' && (
            <div className="guide-section">
              <div className="guide-combo">
                <strong>Single</strong>
                <span>Any one card</span>
              </div>
              <div className="guide-combo">
                <strong>Pair</strong>
                <span>Two cards of same rank</span>
              </div>
              <div className="guide-combo">
                <strong>Triple</strong>
                <span>Three cards of same rank</span>
              </div>
              <div className="guide-combo">
                <strong>Straight</strong>
                <span>5+ consecutive ranks (any suits)</span>
              </div>
              <div className="guide-combo">
                <strong>Full House</strong>
                <span>Triple + Pair (5 cards)</span>
              </div>
              <div className="guide-combo">
                <strong>Consecutive Pairs</strong>
                <span>2+ pairs in sequence (e.g. 55-66-77)</span>
              </div>
              <div className="guide-combo guide-combo-bomb">
                <strong>Bomb: Four of a Kind</strong>
                <span>Four cards of same rank — beats anything!</span>
              </div>
              <div className="guide-combo guide-combo-bomb">
                <strong>Bomb: Straight Flush</strong>
                <span>5+ consecutive same suit — beats everything!</span>
              </div>
              <p className="guide-note">You must play the same type &amp; length, but higher rank. Bombs beat any combo at any time.</p>
            </div>
          )}

          {tab === 'specials' && (
            <div className="guide-section">
              <div className="guide-combo">
                <strong>Mahjong (1)</strong>
                <span>Lowest single. Leads first trick. You make a Wish for a rank.</span>
              </div>
              <div className="guide-combo">
                <strong>Dog</strong>
                <span>Played alone when leading. Passes the lead to your partner.</span>
              </div>
              <div className="guide-combo">
                <strong>Phoenix</strong>
                <span>Wild card. As single: beats current card (except Dragon). In combos: substitutes any rank.</span>
              </div>
              <div className="guide-combo">
                <strong>Dragon</strong>
                <span>Highest single (beats Ace). Winner must give the trick to an opponent.</span>
              </div>
              <p className="guide-note">Phoenix can be used in pairs, triples, straights, and full houses as a substitute for any normal card.</p>
            </div>
          )}

          {tab === 'rules' && (
            <div className="guide-section">
              <div className="guide-combo">
                <strong>Teams</strong>
                <span>Players across from each other are partners (seats 0&amp;2, 1&amp;3)</span>
              </div>
              <div className="guide-combo">
                <strong>Tichu</strong>
                <span>Bet 100 pts you'll go out first. Call before playing your first card.</span>
              </div>
              <div className="guide-combo">
                <strong>Grand Tichu</strong>
                <span>Bet 200 pts you'll go out first. Decided after seeing only 8 cards.</span>
              </div>
              <div className="guide-combo">
                <strong>Card Passing</strong>
                <span>Pass 1 card to each other player before playing begins.</span>
              </div>
              <div className="guide-combo">
                <strong>Wish</strong>
                <span>When Mahjong is played, you name a rank. Next player who can play that rank must.</span>
              </div>
              <div className="guide-combo">
                <strong>1-2 Finish</strong>
                <span>If both teammates go out 1st and 2nd: +200 points, round ends immediately.</span>
              </div>
              <div className="guide-combo">
                <strong>Scoring</strong>
                <span>Kings &amp; 10s = 10pts. 5s = 5pts. Dragon = 25pts. Phoenix = -25pts. Play to target score.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
