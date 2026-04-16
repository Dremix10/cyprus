import { useState } from 'react';
import { Suit, NormalRank, SpecialCardType } from '@cyprus/shared';
import type { Card } from '@cyprus/shared';
import { CardComponent } from './CardComponent.js';
import { useT } from '../i18n.js';

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

interface StepDef {
  cards?: Card[];
  highlightCards?: Set<string>;
  interactive?: 'select' | 'select-combo';
  correctSelection?: Set<string>;
  textCount: number;
}

const stepDefs: StepDef[] = [
  // 0: Welcome
  { textCount: 3 },
  // 1: Normal cards
  {
    textCount: 3,
    cards: [
      nc(S.JADE, R.TWO), nc(S.PAGODA, R.FIVE), nc(S.STAR, R.EIGHT),
      nc(S.SWORD, R.TEN), nc(S.JADE, R.JACK), nc(S.PAGODA, R.QUEEN),
      nc(S.STAR, R.KING), nc(S.SWORD, R.ACE),
    ],
  },
  // 2: Special cards
  {
    textCount: 5,
    cards: [sc(SP.MAHJONG), sc(SP.DOG), sc(SP.PHOENIX), sc(SP.DRAGON)],
  },
  // 3: Point values
  {
    textCount: 7,
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.TEN), nc(S.SWORD, R.KING),
      sc(SP.DRAGON), sc(SP.PHOENIX),
    ],
  },
  // 4: Grand Tichu
  {
    textCount: 3,
    cards: [
      sc(SP.DRAGON), nc(S.STAR, R.ACE), nc(S.SWORD, R.ACE),
      nc(S.JADE, R.KING), nc(S.PAGODA, R.KING),
      nc(S.STAR, R.QUEEN), nc(S.JADE, R.TEN), nc(S.PAGODA, R.NINE),
    ],
  },
  // 5: Card passing
  {
    textCount: 3,
    cards: [
      nc(S.JADE, R.THREE), nc(S.PAGODA, R.FOUR), nc(S.STAR, R.SIX),
      nc(S.SWORD, R.SEVEN), nc(S.JADE, R.NINE), nc(S.PAGODA, R.JACK),
      nc(S.STAR, R.QUEEN), nc(S.SWORD, R.ACE),
    ],
    interactive: 'select',
    correctSelection: new Set(['JADE_3', 'PAGODA_4', 'STAR_6']),
  },
  // 6: Tichu
  { textCount: 4 },
  // 7: Singles & Pairs
  {
    textCount: 4,
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.EIGHT),
      nc(S.JADE, R.KING), nc(S.PAGODA, R.KING),
      nc(S.SWORD, R.ACE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_13', 'PAGODA_13']),
  },
  // 8: Triples & Full House
  {
    textCount: 3,
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.FIVE),
      nc(S.JADE, R.EIGHT), nc(S.PAGODA, R.EIGHT), nc(S.STAR, R.EIGHT),
      nc(S.SWORD, R.JACK),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_8', 'PAGODA_8', 'STAR_8', 'JADE_5', 'STAR_5']),
  },
  // 9: Straights
  {
    textCount: 3,
    cards: [
      nc(S.JADE, R.FOUR), nc(S.PAGODA, R.FIVE), nc(S.STAR, R.SIX),
      nc(S.SWORD, R.SEVEN), nc(S.JADE, R.EIGHT),
      nc(S.STAR, R.QUEEN), nc(S.PAGODA, R.ACE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_4', 'PAGODA_5', 'STAR_6', 'SWORD_7', 'JADE_8']),
  },
  // 10: Consecutive Pairs
  {
    textCount: 3,
    cards: [
      nc(S.JADE, R.THREE), nc(S.STAR, R.THREE),
      nc(S.PAGODA, R.FOUR), nc(S.SWORD, R.FOUR),
      nc(S.JADE, R.NINE), nc(S.STAR, R.KING),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_3', 'STAR_3', 'PAGODA_4', 'SWORD_4']),
  },
  // 11: Bombs
  {
    textCount: 5,
    cards: [
      nc(S.JADE, R.JACK), nc(S.PAGODA, R.JACK), nc(S.STAR, R.JACK), nc(S.SWORD, R.JACK),
      nc(S.JADE, R.THREE), nc(S.STAR, R.NINE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_11', 'PAGODA_11', 'STAR_11', 'SWORD_11']),
  },
  // 12: How tricks work
  {
    textCount: 4,
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.FIVE),
      nc(S.JADE, R.QUEEN), nc(S.PAGODA, R.QUEEN),
      nc(S.SWORD, R.THREE),
    ],
    interactive: 'select-combo',
    correctSelection: new Set(['JADE_12', 'PAGODA_12']),
  },
  // 13: The Wish
  {
    textCount: 4,
    cards: [sc(SP.MAHJONG)],
  },
  // 14: The Dragon
  {
    textCount: 4,
    cards: [sc(SP.DRAGON)],
  },
  // 15: The Dog
  {
    textCount: 3,
    cards: [sc(SP.DOG)],
  },
  // 16: Going Out
  { textCount: 5 },
  // 17: Scoring
  {
    textCount: 6,
    cards: [
      nc(S.JADE, R.FIVE), nc(S.STAR, R.TEN), nc(S.SWORD, R.KING),
      sc(SP.DRAGON), sc(SP.PHOENIX),
    ],
  },
  // 18: Strategy
  { textCount: 8 },
];

export function Tutorial({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [currentStep, setCurrentStep] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));

  const def = stepDefs[currentStep];
  const title = t(`tutorial.${currentStep}.title`);
  const texts: string[] = [];
  for (let i = 0; i < def.textCount; i++) {
    texts.push(t(`tutorial.${currentStep}.text.${i}`));
  }
  const successMsg = t(`tutorial.${currentStep}.successMsg`);
  const hintMsg = t(`tutorial.${currentStep}.hintMsg`);
  const hasSuccess = successMsg !== `tutorial.${currentStep}.successMsg`;
  const hasHint = hintMsg !== `tutorial.${currentStep}.hintMsg`;

  function toggleCard(id: string) {
    if (!def.interactive) return;
    if (solved.has(currentStep)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkAnswer() {
    if (!def.correctSelection) return false;
    if (selected.size !== def.correctSelection.size) return false;
    for (const id of selected) {
      if (!def.correctSelection.has(id)) return false;
    }
    return true;
  }

  const isCorrect = def.interactive && checkAnswer();
  const isSolved = solved.has(currentStep);
  const needsSelection = def.interactive && def.correctSelection && !isSolved;
  const selectionCount = selected.size;
  const targetCount = def.correctSelection?.size ?? 0;

  function goNext() {
    if (isCorrect && !isSolved) {
      setSolved((prev) => new Set(prev).add(currentStep));
    }
    if (currentStep < stepDefs.length - 1) {
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

  const completedCount = stepDefs.filter((s, i) => {
    if (s.interactive && s.correctSelection) return solved.has(i);
    return visited.has(i);
  }).length;
  const progressPercent = Math.round((completedCount / stepDefs.length) * 100);

  return (
    <div className="tutorial-fullscreen">
      <div className="tutorial-sidebar">
        <h2 className="tutorial-sidebar-title">{t('tutorial.title')}</h2>
        <div className="tutorial-progress">
          <div className="tutorial-progress-bar">
            <div className="tutorial-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="tutorial-progress-label">{t('tutorial.complete', { percent: progressPercent })}</span>
        </div>
        <nav className="tutorial-nav">
          {stepDefs.map((_, i) => (
            <button
              key={i}
              className={`tutorial-nav-item ${i === currentStep ? 'tutorial-nav-active' : ''} ${solved.has(i) ? 'tutorial-nav-solved' : ''}`}
              onClick={() => goToStep(i)}
            >
              <span className="tutorial-nav-num">{i + 1}</span>
              {t(`tutorial.${i}.title`)}
            </button>
          ))}
        </nav>
        <button className="btn btn-olympus btn-back" onClick={onBack}>
          {t('tutorial.backToLobby')}
        </button>
      </div>

      <div className="tutorial-main">
        <div className="tutorial-step-counter">
          {t('tutorial.stepOf', { current: currentStep + 1, total: stepDefs.length })}
        </div>

        <h2 className="tutorial-section-title">{title}</h2>

        <div className="tutorial-content">
          {texts.map((paragraph, i) => (
            <p key={i} className="tutorial-paragraph">{paragraph}</p>
          ))}
        </div>

        {def.cards && (
          <div className="tutorial-cards">
            {def.cards.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                selected={selected.has(card.id)}
                onClick={def.interactive ? () => toggleCard(card.id) : undefined}
              />
            ))}
          </div>
        )}

        {needsSelection && !isCorrect && selectionCount > 0 && selectionCount < targetCount && hasHint && (
          <p className="tutorial-hint">{hintMsg} ({selectionCount}/{targetCount} selected)</p>
        )}

        {needsSelection && selectionCount >= targetCount && !isCorrect && hasHint && (
          <p className="tutorial-wrong">{t('tutorial.wrongSelection', { hint: hintMsg })}</p>
        )}

        {(isCorrect || isSolved) && hasSuccess && (
          <p className="tutorial-success">{successMsg}</p>
        )}

        <div className="tutorial-page-nav">
          {currentStep > 0 ? (
            <button className="btn btn-olympus btn-tutorial-prev" onClick={goPrev}>
              {t('tutorial.previous')}
            </button>
          ) : <span />}
          {currentStep < stepDefs.length - 1 ? (
            <button
              className="btn btn-olympus btn-tutorial-next"
              onClick={goNext}
              disabled={needsSelection && !isCorrect && !isSolved}
            >
              {t('tutorial.next')}
            </button>
          ) : (
            <button className="btn btn-olympus btn-tutorial-next" onClick={onBack}>
              {t('tutorial.startPlaying')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
