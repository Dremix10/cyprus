---
name: Bot AI parameter tuning and MC budget results
description: Results of 10K-game param tuning, MC budget simulations, simulation framework bugs, new difficulty levels, lessons learned
type: project
originSessionId: c75fca32-bc25-48f5-8df6-e297a06f5e1a
---
## Bot AI Tuning Results (2026-04-10)

Tested via `versus-sim.ts` — 10,000 games each, positions swapped halfway to eliminate bias.
Threshold: >52% = improvement, <48% = worse, 48-52% = neutral.

### Applied improvements (now in DEFAULT_BOT_CONFIG):
| Parameter | Value | Win Rate | Notes |
|-----------|-------|----------|-------|
| dogPlayMaxCards | 14 | ~51.5% | Always play Dog (was 6) |
| dogPlayPartnerCards | 14 | ~51.5% | Combined with above |
| dragonFollowMinPoints | 10 | ~51.7% | Save Dragon for 10+ pt tricks (was 0) |
| passAceToPartner | true | 52.5% | Pass an Ace to partner during card passing |
| smartCardTracking | true | +10-12.6pp | Use cardInfo tracker to discourage wasted high cards and Ace preservation (commit 471c3fd, 2026-04-19) |

### Tested but neutral/negative (do NOT add back):
| Parameter | Value Tested | Win Rate | Notes |
|-----------|-------------|----------|-------|
| bombPointThreshold | 10 (was 15) | 51.1% | Neutral — more aggressive bombing doesn't help |
| grandTichuThreshold | 8 (was 9) | 51.0% | Neutral — more grand tichu calls, higher success rate but same wins |
| grandTichuThreshold | 7 | 51.1% | Neutral |
| grandTichu 8 + bomb 10 | combined | 51.3% | Neutral even combined |
| phoenixFollowMinPoints | 0 (was 5) | 49.5% | Slightly worse — always using Phoenix wastes it |
| phoenixFollowMinPoints | 10 | 49.8% | Neutral — current 5 is optimal |
| acePassHandSize | 8 (was 10) | 49.3% | Slightly worse — too aggressive ace saving |
| acePassHandSize | 12 | 50.2% | Neutral |
| bombEndgameCards | 7 (was 5) | 50.0% | Dead neutral |
| tichuMinControl | 3 (was 2) | 48.8% | Worse — stricter tichu calling loses bonus points |
| mahjongPreferStraight | true | 50.3% | Neutral — leading Mahjong in straights hurts first-out rate |
| passAceToPartner + bomb 10 | combined | 51.4% | Neutral above ace-passing alone |
| alwaysBeatTichuCaller | true | 50.2% | Neutral — card conservation is better |
| leadLowForPartnerCards | 4 | 38.8% | VERY BAD — gives opponents easy wins |

### Key insights:
- Card passing strategy has the biggest impact — giving partner an Ace is the single best improvement found
- Dog play timing (always play it) was the second biggest win
- Dragon conservation (10+ point threshold) stacks well with Dog timing
- Tichu calling is already well-calibrated — making it stricter loses the bonus point advantage
- Bombing thresholds are already near-optimal at 15
- Phoenix thresholds are already optimal at 5
- Leading low for partner without Tichu call is catastrophically bad
- Most parameters show diminishing returns — the bot's core strategy is solid

## MC Budget Simulation Results (2026-04-16)

Tested whether increasing Monte Carlo simulation budget improves bot play.
All tests: 50 games with position swap at halfway to eliminate positional bias.

| Matchup | Winner | Win rate |
|---------|--------|----------|
| 2x (400 sims/300ms) vs 1x (200 sims/150ms) | 2x | **76%** |
| 3x (600 sims/400ms) vs 2x (400 sims/300ms) | 3x | **62%** |

Diminishing returns: 1x→2x is huge (rough guess → decent eval), 2x→3x is smaller but still significant.

**New difficulty levels implemented (commit 61d96da):**
- Hard: 200 sims / 150ms (unchanged, default)
- Extreme: 400 sims / 300ms (2x)
- Unfair: 600 sims / 400ms (3x)

## Tier-vs-Tier Win Rates Under Corrected Scoring (2026-04-18)

Re-measured difficulty ladder using `versus-tier-sim.ts` after fixing the last-player won-tricks scoring bug. 50 games each with position swap at halfway.

| Matchup | Lower wins | Higher wins | Avg score (L / H) | First out (L / H) | Tichu succ (L / H) | 1-2 rate (L / H) |
|---------|-----------|------------|-------------------|-------------------|--------------------|------------------|
| medium vs hard | 8.0% | **92.0%** | 580 / 1042 | 42.6% / 49.8% | 52.9% / 87.5% | 8.0% / 20.0% |
| hard vs extreme | 36.0% | **64.0%** | 793 / 931 | 42.0% / 50.7% | 66.7% / 84.6% | 12.8% / 17.5% |
| extreme vs unfair | 38.0% | **62.0%** | 794 / 924 | 44.8% / 47.8% | 68.8% / 76.5% | 13.8% / 18.8% |

**Tier edge deltas (this is the ladder):**
- medium → hard: **+84 pp** (largest jump — MC engagement itself)
- hard → extreme: **+28 pp** (2× MC budget)
- extreme → unfair: **+24 pp** (1.5× MC budget on top of extreme)

**Key observations:**
- Each MC-budget step still pays off meaningfully; gains are NOT strongly diminishing at the top. Earlier hypothesis of "3× ≈ 2×" was from old scoring.
- First-out rate rises with tier and tracks wins, but at the top (extreme vs unfair) first-out is nearly tied — the higher tier's advantage comes from **1-2 double victories** (18.8% vs 13.8%), not from being first out.
- Tichu success rate is a reliable skill signal: climbs sharply at low tiers (52.9% → 87.5% from medium→hard), flattens at the top (~70-85% for hard/extreme/unfair).
- Grand Tichu was essentially never called in any run (0-1 total calls per 50 games) — current `grandTichuThreshold` of 9 is very conservative.

**Run time (all on 50 games):** medium-vs-hard 5.4 min, hard-vs-extreme 16.9 min, extreme-vs-unfair 27.6 min.

## smartCardTracking Validation & Ship (2026-04-19)

Tested three experimental flags via `versus-tier-sim.ts`:

| Flag | Test | Win Rate | Verdict |
|------|------|----------|---------|
| scoreAwareTichu | medium-vs-medium, 10K | 48.4% | Slightly negative — do not ship |
| opponentCardCountBombing | medium-vs-medium, 10K | 49.7% | Neutral — do not ship |
| **smartCardTracking** | medium-vs-medium, 10K | **56.3%** | **+12.6pp — ship** |
| smartCardTracking | hard-vs-hard, 100 games | 55.0% | +10pp (MC dilutes slightly) |
| smartCardTracking | unfair-vs-unfair, 50 games | 56.0% | +12pp (holds at top tier) |

**What smartCardTracking does** (`findBestFollowCard` in BotAI.ts, guarded by `config.smartCardTracking && cardInfo`):
1. For pairs/trips/quads: check if any higher rank still has ≥N copies remaining (or phoenix + N-1). If unbeatable → score −6 (discourage playing too high when nothing can beat it).
2. For singles: if Ace or higher and a 10+ single would suffice → score +4 (prefer saving the Ace).

**Signature across all three tiers:** lower first-out rate, higher avg score, +4-16pp Tichu success. Bot wins via point-heavy trick defense, not racing to finish.

Shipped on dev in commit 471c3fd. `DEFAULT_BOT_CONFIG.smartCardTracking = true` for all tiers.

## Heuristic & MC Algorithm Improvement Attempts (2026-04-16)

Tested several bot improvements via versus-sim.ts — all made bots worse:

1. **Heuristic changes** (1-2 finish awareness, smart wish, lead low for partner, 1v1 endgame): old bots won 65%. Lead-low gave opponents free tricks, 1v1 never-pass wasted bombs.
2. **MC algorithm improvements** (UCB1, context refresh, richer eval, early termination): old bots won 78%. UCB1 too noisy with ~40 sims/candidate, context refresh burned CPU reducing total sims, richer eval added noise, early termination locked in bad decisions.

**Lesson:** The simple approach (more budget) worked far better than clever algorithmic improvements. Don't attempt multiple simultaneous changes.

## Simulation Framework Bug Found (2026-04-16)

**Double-swap bug in budget-sim.ts:** `runTest` swapped the arguments AND `runGame` internally swapped via the `swapped` flag, canceling each other out. All budget-sim results showed fake 50/50.

**versus-sim.ts was NOT affected** — its two swap mechanisms (arg swap for BotConfig, internal swap for MC evaluator) aligned correctly.

**Fix:** Remove the arg swap, let only `runGame`'s internal flag handle it:
```js
// WRONG: const result = runGame(swapped ? budgetB : budgetA, swapped ? budgetA : budgetB, swapped);
// CORRECT: const result = runGame(budgetA, budgetB, swapped);
```

**Validation:** bias-test.ts (200 games, no MC, identical bots) confirmed engine has no positional bias (exactly 50/50). Takes <30 seconds. Always run this first.

## Key Lessons for Future Simulation Work

1. **Validate the test framework FIRST** — run identical bots, confirm 50/50 before testing changes
2. **Simple budget increase > clever algorithms** — more sims with existing code beats UCB1, richer eval, etc.
3. **Test one change at a time** with 50+ games
4. **MC sims are slow** — 50 games with MC: ~17-25 min. No-MC tests: <30 sec for 200 games
5. **User wants detailed progress every 5 games** — wins, scores, tichu, grand tichu, double victories, first outs
6. **Be honest about time estimates** — MC games take ~20-30s each, not 2-3 minutes total

### Future ideas to test:
- Score-aware tichu calling (more aggressive when behind)
- Card counting for wish decisions (wish for unplayed ranks)
- Position-aware following (different strategy based on seat order)
- Smarter card passing scoring (consider partner's likely hand shape)
- MC rollout policy improvements (use medium-level heuristics instead of hard to reduce noise)

## Batch 1 Heuristic Experiments (2026-04-21) — ALL NEUTRAL, NOT SHIPPED

Goal: improve non-MC bot (medium tier) since MC doesn't scale. 10K medium-vs-medium, baseline vs baseline+flag.

| Flag | Treatment Win | Notes |
|------|--------------:|-------|
| respectPartnerLead | 50.5% | Too narrow — partner-strong-lead-got-beaten-and-small-trick rarely triggers |
| lowerBombThresholdVsTichu (8pt vs Tichu) | 49.9% | Existing minOppCards≤3 + Tichu rule already covers most; Tichu itself rare |
| phoenixConservationEndgame (Phoenix single min-rank = A when opp near out) | 50.0% | State combination almost never fires |
| All 3 combined | 49.8% | No interaction effect |

**Lesson:** Narrow guard-clause rules don't move 10K-game win rate. Future heuristic changes should target **hot paths** (leads/follows that fire every round), not edge cases. Measure trigger rate first — if flag fires <5% of decisions, expected win-rate impact is tiny.

Code reverted — all 3 flags removed from BotAI.ts after negative results.

## Batch 2 Heuristic Experiments (2026-04-21) — ALL NEUTRAL/NEGATIVE, NOT SHIPPED

Targeted hot paths (every-round decisions) per Batch 1 lesson. 10K medium-vs-medium, baseline vs baseline+flag.

| Flag | Treatment Win | Notes |
|------|--------------:|-------|
| smartWishSelection (skip exhausted ranks) | 49.9% | Dead neutral — existing high-rank-first logic picks live ranks by coincidence |
| partnerHandAwarePassing (keep Ace if own hand weak) | **47.6%** | **ACTIVELY HARMFUL −4.8pp** — passAceToPartner is optimal as-is; conditional keeping hurts team |
| preferAceOverPhoenix | 49.3% | Slight loss — Phoenix half-rank is already optimally priced |
| All 3 combined | 48.3% | Sim 2 dominates — still harmful |

**Meta-lesson:** Current medium-effective-hard bot is near-optimal on intuition-driven heuristic angles. Both Batch 1 (guard clauses) and Batch 2 (hot-path tweaks) show diminishing returns. Further blind tweaks are likely to hurt (47.6% was worse than neutral). **Need instrumentation or real-player data to find actual leaks.**

Code reverted — all 3 flags removed after negative results.

## Instrumentation Framework (2026-04-21)

Built `BotDecisionRecorder` interface on BotAI + `instrument-sim.ts` script. 1000 games finishes in ~8s and counts which lead/follow branches fire. Tagged ~20 branches in `chooseLeadHard` and `chooseFollowHard`.

Hot paths identified (per `instrument-sim.ts 1000 medium`):
- `follow:smart-select` — ~46.5% of follow decisions — routes through `findBestFollowCard` scoring formula
- `lead:singleton` / `lead:low-single` — most lead decisions
- Previously-targeted branches (Batch 1/2) all fire <2% — explains their neutral results

## Batch 3 — aceSaveOnLowTricks (2026-04-21) — NEGATIVE, NOT SHIPPED

Targeted `findBestFollowCard` (46.5% hot path). Added +8 score penalty to Ace-singles when trickPoints<10, on top of existing +4 overkill penalty.

| Flag | Test | Treatment Win | Notes |
|------|------|--------------:|-------|
| aceSaveOnLowTricks | 10K medium-vs-medium | **48.5%** | **−3.0pp worse** |

Signature: treatment first-out 45.8% vs baseline 47.1% (−1.3pp); avg score 861 vs 880 (−19). Bots hoarded Aces for "better tricks" that rarely came, hurting first-out. The existing overkill-Ace +4 penalty is already priced correctly; stacking more made Aces effectively untouchable.

**Lesson:** Hot-path scoring tweaks are also dangerous — the formula is well-tuned. A single +8 coefficient shift (small in isolation) dropped 3pp. Future scoring changes need to be tested with smaller values (+2, +4) before concluding the direction is wrong.

Code reverted — flag removed after negative result.
