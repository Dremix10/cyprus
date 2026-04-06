import { useState } from 'react';
import { Suit, NormalRank, SpecialCardType } from '@cyprus/shared';
import type { Card } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';

// Helpers to create cards
function nc(suit: Suit, rank: NormalRank): Card {
  return { type: 'normal', suit, rank, id: `${suit}_${rank}` };
}
function sc(specialType: SpecialCardType): Card {
  return { type: 'special', specialType, id: specialType };
}

const S = Suit;
const R = NormalRank;
const SP = SpecialCardType;

interface Step {
  title: string;
  text: string[];
  cards?: Card[];
  highlightCards?: Set<string>;
  interactive?: 'select' | 'select-combo';
  correctSelection?: Set<string>;
  successMsg?: string;
  hintMsg?: string;
}

const steps: Step[] = [
  // 0: Welcome
  {
    title: 'Welcome to Tichu',
    text: [
      'Tichu is a team card game for 4 players — two teams of two. Your partner sits across from you.',
      'The goal: be the first team to reach the target score (usually 1000). You score by getting rid of your cards quickly and collecting point cards.',
      'Let\'s learn how to play step by step!',
    ],
  },
  // 1: The Deck - Normal cards
  {
    title: 'The Cards — Normal Cards',
    text: [
      'The deck has 56 cards. There are 4 suits with cards ranked 2 through Ace:',
      'Jade (green), Pagoda (blue), Star (red), and Sword (black).',
      'Here are some example cards. Cards rank from 2 (lowest) to Ace (highest):',
    ],
    cards: [
      nc(S.JADE, R.TWO), nc(S.PAGODA, R.FIVE), nc(S.STAR, R.EIGHT),
      nc(S.SWORD, R.TEN), nc(S.JADE, R.JACK), nc(S.PAGODA, R.QUEEN),
      nc(S.STAR, R.KING), nc(S.SWORD, R.ACE),
    ],
  },
  // 2: Special cards
  {
    title: 'The Cards — Special Cards',
    text: [
      'There are also 4 unique special cards:',
      'Mahjong (1) — The lowest single card. Whoever has it leads the first trick. When played, you may wish for a rank.',
      'Dog — Pass the lead to your partner. Can only be led (not played on top of something).',
      'Phoenix — A wild card! Can substitute for any rank in combinations. Played alone, it beats the current card by half a rank. Worth -25 points.',
      'Dragon — The highest single card. Beats everything. But when you win a Dragon trick, you must give it to an opponent!',
    ],
    cards: [sc(SP.MAHJONG), sc(SP.DOG), sc(SP.PHOENIX), sc(SP.DRAGON)],
  },
  // 3: Point values
  {
    title: 'Card Point Values',
    text: [
      'Most cards are worth 0 points. Only these matter for scoring:',
      'Fives = 5 points each',
      'Tens = 10 points each',
      'Kings = 10 points each',
      'Dragon = 25 points',
      'Phoenix = -25 points',
      'The total points in the deck always add up to 100. Try tapping the point cards below:',
    ],
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.TEN), nc(S.SWORD, R.KING),
      sc(SP.DRAGON), sc(SP.PHOENIX),
    ],
  },
  // 4: Grand Tichu
  {
    title: 'Grand Tichu',
    text: [
      'At the start of each round, you see only 8 of your 14 cards.',
      'You can call "Grand Tichu" — a bold bet that you\'ll go out FIRST. It\'s worth +200 points if you succeed, but -200 if you fail!',
      'Here\'s a sample opening hand of 8 cards. Would you call Grand Tichu with this hand? (This is a strong hand!)',
    ],
    cards: [
      sc(SP.DRAGON), nc(S.STAR, R.ACE), nc(S.SWORD, R.ACE),
      nc(S.JADE, R.KING), nc(S.PAGODA, R.KING),
      nc(S.STAR, R.QUEEN), nc(S.JADE, R.TEN), nc(S.PAGODA, R.NINE),
    ],
  },
  // 5: Card passing
  {
    title: 'Card Passing',
    text: [
      'After all 14 cards are dealt, you must pass 3 cards — one to each other player (left, partner, right).',
      'Strategy: pass strong cards to your partner and weak or disruptive cards to opponents.',
      'Try selecting 3 cards to pass from this hand:',
    ],
    cards: [
      nc(S.JADE, R.THREE), nc(S.PAGODA, R.FOUR), nc(S.STAR, R.SIX),
      nc(S.SWORD, R.SEVEN), nc(S.JADE, R.NINE), nc(S.PAGODA, R.JACK),
      nc(S.STAR, R.QUEEN), nc(S.SWORD, R.ACE),
    ],
    interactive: 'select',
    correctSelection: new Set(['JADE_3', 'PAGODA_4', 'STAR_6']),
    successMsg: 'You selected 3 cards! In a real game, each goes to a different player.',
    hintMsg: 'Select any 3 cards to pass. Low cards are usually good to give opponents!',
  },
  // 6: Tichu
  {
    title: 'Tichu Call',
    text: [
      'After receiving all 14 cards (but before playing any), you may call "Tichu" — a bet that you\'ll go out first.',
      'Tichu is worth +100 / -100 (less risky than Grand Tichu\'s +200 / -200).',
      'You can\'t call both Grand Tichu and Tichu in the same round.',
      'Call Tichu when you have a strong hand with good leads and few weak cards.',
    ],
  },
  // 7: Combinations - Singles & Pairs
  {
    title: 'Combinations — Singles & Pairs',
    text: [
      'You play cards in combinations. Each player must play the same type but higher rank, or pass.',
      'Single — Any one card.',
      'Pair — Two cards of the same rank.',
      'Try selecting the pair of Kings from the cards below:',
    ],
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.EIGHT),
      nc(S.JADE, R.KING), nc(S.PAGODA, R.KING),
      nc(S.SWORD, R.ACE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_13', 'PAGODA_13']),
    successMsg: 'Correct! That\'s a pair of Kings. It can only be beaten by a pair of Aces (or a bomb).',
    hintMsg: 'Select the two Kings to form a pair.',
  },
  // 8: Combinations - Triples, Full House
  {
    title: 'Combinations — Triples & Full House',
    text: [
      'Triple — Three cards of the same rank (e.g., three 8s).',
      'Full House — A triple plus a pair (e.g., three 8s + two Kings).',
      'Try selecting the Full House from these cards (three 8s and two 5s):',
    ],
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.FIVE),
      nc(S.JADE, R.EIGHT), nc(S.PAGODA, R.EIGHT), nc(S.STAR, R.EIGHT),
      nc(S.SWORD, R.JACK),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_8', 'PAGODA_8', 'STAR_8', 'JADE_5', 'STAR_5']),
    successMsg: 'Correct! A Full House of 8s over 5s. It can be beaten by a Full House with a higher triple (e.g., three 9s + any pair).',
    hintMsg: 'Select all three 8s and both 5s to form a Full House.',
  },
  // 9: Combinations - Straights
  {
    title: 'Combinations — Straights',
    text: [
      'Straight — Five or more consecutive cards (e.g., 3-4-5-6-7). Suits don\'t matter.',
      'The Mahjong counts as 1 in a straight. Aces are high (they don\'t wrap around).',
      'Try selecting a 5-card straight from these cards:',
    ],
    cards: [
      nc(S.JADE, R.FOUR), nc(S.PAGODA, R.FIVE), nc(S.STAR, R.SIX),
      nc(S.SWORD, R.SEVEN), nc(S.JADE, R.EIGHT),
      nc(S.STAR, R.QUEEN), nc(S.PAGODA, R.ACE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_4', 'PAGODA_5', 'STAR_6', 'SWORD_7', 'JADE_8']),
    successMsg: 'Correct! A straight from 4 to 8. A same-length straight must start higher to beat it (e.g., 5-9).',
    hintMsg: 'Select 4, 5, 6, 7, 8 to form a straight.',
  },
  // 10: Combinations - Consecutive Pairs
  {
    title: 'Combinations — Consecutive Pairs',
    text: [
      'Consecutive Pairs — Two or more pairs in sequence (e.g., 5-5-6-6 or 9-9-10-10-J-J).',
      'Must have at least 2 consecutive pairs. This is a powerful combination!',
      'Try selecting the consecutive pairs (3-3-4-4) below:',
    ],
    cards: [
      nc(S.JADE, R.THREE), nc(S.STAR, R.THREE),
      nc(S.PAGODA, R.FOUR), nc(S.SWORD, R.FOUR),
      nc(S.JADE, R.NINE), nc(S.STAR, R.KING),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_3', 'STAR_3', 'PAGODA_4', 'SWORD_4']),
    successMsg: 'Correct! Consecutive pairs of 3s and 4s. Must be beaten by the same length starting higher (e.g., 4-4-5-5).',
    hintMsg: 'Select both 3s and both 4s.',
  },
  // 11: Bombs
  {
    title: 'Bombs!',
    text: [
      'Bombs are the most powerful plays in Tichu. They beat ANY other combination!',
      'Four of a Kind — Four cards of the same rank. A higher four-of-a-kind beats a lower one.',
      'Straight Flush — Five or more consecutive cards of the SAME SUIT. A longer straight flush beats a shorter one.',
      'Bombs can be played at ANY time — even when it\'s not your turn!',
      'Select the bomb (four Jacks) below:',
    ],
    cards: [
      nc(S.JADE, R.JACK), nc(S.PAGODA, R.JACK), nc(S.STAR, R.JACK), nc(S.SWORD, R.JACK),
      nc(S.JADE, R.THREE), nc(S.STAR, R.NINE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_11', 'PAGODA_11', 'STAR_11', 'SWORD_11']),
    successMsg: 'Correct! Four Jacks — a bomb! This beats any non-bomb play, and can only be beaten by four Queens or higher (or a straight flush).',
    hintMsg: 'Select all four Jacks to form a bomb.',
  },
  // 12: Playing tricks
  {
    title: 'How Tricks Work',
    text: [
      'The Mahjong holder leads the first trick. After that, the trick winner leads.',
      'Each player must play the same combination type at a higher rank, or pass. When all others pass, the last player wins the trick.',
      'Example: Player A leads a pair of 7s. Player B plays a pair of 10s. Player C passes. Player D plays a pair of Aces. Back to A, who passes. B passes. D wins the trick!',
      'Here\'s the pair of 10s on the table. Select a higher pair from your hand to beat it:',
    ],
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.FIVE),
      nc(S.JADE, R.QUEEN), nc(S.PAGODA, R.QUEEN),
      nc(S.SWORD, R.THREE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_12', 'PAGODA_12']),
    successMsg: 'Correct! Your pair of Queens beats the pair of 10s on the table.',
    hintMsg: 'Select the two Queens — they\'re the only pair that beats the 10s.',
  },
  // 13: The Wish
  {
    title: 'The Mahjong Wish',
    text: [
      'When you play the Mahjong (1), you may wish for any rank from 2 through Ace.',
      'The next player who CAN legally play that rank MUST do so. The wish stays active until fulfilled.',
      'Use this strategically — wish for a rank you know an opponent is holding to force them to play it!',
      'For example, if you suspect the opponent has Aces, wish for Ace to make them waste it.',
    ],
    cards: [sc(SP.MAHJONG)],
  },
  // 14: The Dragon trick
  {
    title: 'The Dragon Trick',
    text: [
      'The Dragon is the highest single card — it beats everything.',
      'But there\'s a catch: when you win a trick that contains the Dragon, you must give the ENTIRE trick to one of your opponents.',
      'This means the Dragon\'s 25 points (and any other points in the trick) go to the other team!',
      'Use the Dragon carefully. Sometimes it\'s better NOT to play it.',
    ],
    cards: [sc(SP.DRAGON)],
  },
  // 15: The Dog
  {
    title: 'The Dog',
    text: [
      'The Dog passes the lead to your partner. It can ONLY be led (not played on top of another combination).',
      'The Dog has no rank and cannot beat any card. It\'s purely a strategic tool.',
      'Use it when your partner has strong cards and should be leading.',
    ],
    cards: [sc(SP.DOG)],
  },
  // 16: Going out
  {
    title: 'Going Out',
    text: [
      'When you play your last card(s), you\'re "out" and done for the round.',
      'The round ends when 3 players are out. The last player standing:',
      '— Gives their remaining hand cards to the opposing team',
      '— Gives their collected tricks to the opposing team',
      'The order you go out matters! Going out first is crucial, especially if you called Tichu.',
    ],
  },
  // 17: Scoring recap
  {
    title: 'Scoring Summary',
    text: [
      'Each round, points come from:',
      '1. Card points — Fives (5), Tens (10), Kings (10), Dragon (25), Phoenix (-25). Total in deck = 100.',
      '2. Tichu bonus — +100 if you called Tichu and went out first. -100 if you failed.',
      '3. Grand Tichu bonus — +200 if you called Grand Tichu and went out first. -200 if you failed.',
      '4. Double Victory — If BOTH teammates go out 1st and 2nd, the team scores 200 points (no card counting).',
      'Here are the point cards again. The 5 and the King below are worth 5 and 10 points:',
    ],
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.TEN), nc(S.SWORD, R.KING),
      sc(SP.DRAGON), sc(SP.PHOENIX),
    ],
  },
  // 18: Strategy
  {
    title: 'Strategy Tips',
    text: [
      'Work with your partner — sometimes pass so they can win the trick.',
      'Save bombs for critical moments — don\'t waste them early.',
      'Watch card counts — know when opponents are close to going out.',
      'Pass wisely — give your partner Aces, give opponents low cards.',
      'Lead singletons to clear them — they\'re hard to get rid of later.',
      'Only call Tichu with a strong hand — a failed call costs 100 points!',
      'When giving the Dragon trick away, pick the opponent with fewer collected points.',
      'You\'re ready to play! Head back to the lobby and start a game. Good luck!',
    ],
  },
];

export function Tutorial({ onBack }: { onBack: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  const step = steps[currentStep];

  function toggleCard(id: string) {
    if (!step.interactive) return;
    if (solved.has(currentStep)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkAnswer() {
    if (!step.correctSelection) return false;
    if (selected.size !== step.correctSelection.size) return false;
    for (const id of selected) {
      if (!step.correctSelection.has(id)) return false;
    }
    return true;
  }

  const isCorrect = step.interactive && checkAnswer();
  const isSolved = solved.has(currentStep);
  const needsSelection = step.interactive && step.correctSelection && !isSolved;
  const selectionCount = selected.size;
  const targetCount = step.correctSelection?.size ?? 0;

  function goNext() {
    if (isCorrect && !isSolved) {
      setSolved((prev) => new Set(prev).add(currentStep));
    }
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setSelected(new Set());
      setVisited((prev) => new Set(prev).add(next));
    }
  }

  function goPrev() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setSelected(new Set());
    }
  }

  function goToStep(i: number) {
    setCurrentStep(i);
    setSelected(new Set());
    setVisited((prev) => new Set(prev).add(i));
  }

  // A step is "completed" if it's non-interactive and visited, or interactive and solved
  const completedCount = steps.filter((s, i) => {
    if (s.interactive && s.correctSelection) return solved.has(i);
    return visited.has(i);
  }).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="tutorial-fullscreen">
      <div className="tutorial-sidebar">
        <h2 className="tutorial-sidebar-title">How to Play</h2>
        <div className="tutorial-progress">
          <div className="tutorial-progress-bar">
            <div className="tutorial-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="tutorial-progress-label">{progressPercent}% complete</span>
        </div>
        <nav className="tutorial-nav">
          {steps.map((s, i) => (
            <button
              key={i}
              className={`tutorial-nav-item ${i === currentStep ? 'tutorial-nav-active' : ''} ${solved.has(i) ? 'tutorial-nav-solved' : ''}`}
              onClick={() => goToStep(i)}
            >
              <span className="tutorial-nav-num">{i + 1}</span>
              {s.title}
            </button>
          ))}
        </nav>
        <button className="btn btn-olympus btn-back" onClick={onBack}>
          Back to Lobby
        </button>
      </div>

      <div className="tutorial-main">
        <div className="tutorial-step-counter">
          Step {currentStep + 1} of {steps.length}
        </div>

        <h2 className="tutorial-section-title">{step.title}</h2>

        <div className="tutorial-content">
          {step.text.map((paragraph, i) => (
            <p key={i} className="tutorial-paragraph">{paragraph}</p>
          ))}
        </div>

        {step.cards && (
          <div className="tutorial-cards">
            {step.cards.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                selected={selected.has(card.id)}
                onClick={step.interactive ? () => toggleCard(card.id) : undefined}
              />
            ))}
          </div>
        )}

        {needsSelection && !isCorrect && selectionCount > 0 && selectionCount < targetCount && (
          <p className="tutorial-hint">{step.hintMsg} ({selectionCount}/{targetCount} selected)</p>
        )}

        {needsSelection && selectionCount >= targetCount && !isCorrect && (
          <p className="tutorial-wrong">Not quite — try a different selection. {step.hintMsg}</p>
        )}

        {(isCorrect || isSolved) && step.successMsg && (
          <p className="tutorial-success">{step.successMsg}</p>
        )}

        <div className="tutorial-page-nav">
          {currentStep > 0 ? (
            <button className="btn btn-olympus btn-tutorial-prev" onClick={goPrev}>
              Previous
            </button>
          ) : <span />}
          {currentStep < steps.length - 1 ? (
            <button
              className="btn btn-olympus btn-tutorial-next"
              onClick={goNext}
              disabled={needsSelection && !isCorrect && !isSolved}
            >
              Next
            </button>
          ) : (
            <button className="btn btn-olympus btn-tutorial-next" onClick={onBack}>
              Start Playing!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
