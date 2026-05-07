# BotConfig Reference

Source of truth: `DEFAULT_BOT_CONFIG` in
[`packages/server/src/BotAI.ts`](../packages/server/src/BotAI.ts) (search for the
declaration; currently around line 369).

## Current defaults (as of commit `19ee000`)

| Flag | Default | Purpose |
|---|---|---|
| `bombPointThreshold` | `15` | Proactive bomb threshold. Bomb only when the trick is worth ≥ 15 pts. Tightened from 10 (Batch ~commit `4233542`) — the 10-pt threshold caused MC rollouts to also waste bombs, hiding the value of saving. |
| `bombEndgameCards` | `5` | Bomb any trick when hand-size ≤ this (endgame dump). |
| `leadDragonAgainstTichu` | `false` | If true, lead the Dragon to counter an opponent Tichu. **Disabled** because of the Dragon-give rule (winning a Dragon trick gives the trick to an opp = guaranteed −25 pts for nothing). |
| `leadAcesAgainstTichu` | `true` | Lead an Ace single (with the unbeatable-Ace guard) against an opponent Tichu. Reasonable: the GT caller is forced to either burn Dragon/Phoenix (we get 25 back via Dragon-give rule) or pass (no progress toward going out). |
| `dragonFollowMinPoints` | `10` | Only play the Dragon as a follow when the trick has ≥ 10 pts (or in endgame). |
| `phoenixFollowMinRank` | `13` | Only play Phoenix as a follow-single when the top card rank ≥ King (legacy, pre-`smartCardTracking`). With `smartCardTracking` on, the filter is stricter and uses `cardInfo.remainingCards` directly. |
| `phoenixFollowMaxCards` | `5` | Skip the Phoenix-save check when hand ≤ this (endgame Phoenix dump is fine). |
| `dogPlayMaxCards` | `14` | "Always play Dog" — the threshold is so high it always fires. Validated as +51.5% win rate vs. baseline. |
| `dogPlayPartnerCards` | `14` | Same — always play Dog when partner has ≤ this many cards. |
| `passAceToPartner` | `true` | Pass an Ace to partner during card-passing phase. Validated +52.5% (single biggest improvement found in tuning). |
| `scoreAwareTichu` | `false` | **DO NOT ENABLE.** Tested at 48.4% win rate over 10K games (slightly negative). |
| `opponentCardCountBombing` | `false` | **DO NOT ENABLE.** Tested at 49.7% (neutral). |
| `smartCardTracking` | `true` | Track played cards via `cardInfo`. Validated +10–12 pp across all tiers. Drives the Phoenix / Dragon / Ace-on-K filters. |
| `useMonteCarlo` | `false` | Per-tier override: `hard`/`extreme`/`unfair` set this to `true` via `BotController.getMcConfig`. |
| `mcSims` | `200` | Max simulations per decision. Per tier: hard=200, extreme=400, unfair=600. |
| `mcTimeMs` | `150` | Hard time budget per decision. Per tier: hard=150, extreme=300, unfair=400. |

## Tier mapping

`BotDifficulty = 'easy' | 'medium' | 'hard' | 'extreme' | 'unfair'`. Internal collapsing
(`effectiveDifficulty`):

| User-facing tier | Internal logic | useMonteCarlo | mcSims / mcTimeMs |
|---|---|---|---|
| `easy` | medium logic | false | — |
| `medium` | hard heuristic | false | — |
| `hard` | hard heuristic + MC | true | 200 / 150 |
| `extreme` | hard heuristic + MC | true | 400 / 300 |
| `unfair` | hard heuristic + MC | true | 600 / 400 |

## Filters layered on top of `BotConfig` (always on, not configurable)

These run at `choosePlay` BEFORE either heuristic or MC dispatch. They strip wasteful
candidates so MC's pre-filter never even sees them.

| Filter | Where | Rule |
|---|---|---|
| `filterBombPreserving` | `choosePlay` always | If hand has all 4 cards of any rank, no play that uses 1–3 of those cards is allowed. The bomb itself (all 4) is fine. **Hard rule, no exceptions.** |
| `filterAceWasteInLeads` | `choosePlay` only when leading | Reject any multi-card combo that uses ≥ 2 Aces (catches AAA-XX full houses, AA pairs, KK-AA consec pairs, 4-of-Aces bomb-as-lead). 1 Ace at the top of a length-5+ straight is fine. |
| Phoenix waste filter | `choosePlay` MC pre-filter | If `cardInfo` shows any opponent card can still beat Phoenix-on-current-top (Dragon or any normal > top+0.5), strip Phoenix-single from candidates unless in endgame or opp about to go out. |
| Dragon waste filter | `choosePlay` MC pre-filter | Strip Dragon-single from candidates if hand > 3, opp not about to go out, and trick points < `bombPointThreshold` (15). |

## Flags tested and rejected

From `docs/notes/bot_ai_tuning_results.md`. Do NOT add these back without re-validation:

| Flag | Tested value | Result |
|---|---|---|
| `bombPointThreshold: 10` | 51.1% — neutral, more aggressive bombing doesn't help |
| `grandTichuThreshold: 8` (was 9) | 51.0% — neutral |
| `grandTichuThreshold: 7` | 51.1% — neutral |
| `phoenixFollowMinPoints: 0` | 49.5% — slightly worse |
| `phoenixFollowMinPoints: 10` | 49.8% — neutral |
| `acePassHandSize: 8` | 49.3% — too aggressive |
| `acePassHandSize: 12` | 50.2% — neutral |
| `bombEndgameCards: 7` | 50.0% — dead neutral |
| `tichuMinControl: 3` (was 2) | 48.8% — worse |
| `mahjongPreferStraight: true` | 50.3% — neutral |
| `alwaysBeatTichuCaller: true` | 50.2% — neutral |
| `leadLowForPartnerCards: 4` | **38.8%** — VERY BAD |
| `respectPartnerLead: true` | 50.5% — too narrow |
| `lowerBombThresholdVsTichu: true` | 49.9% — covered by existing rules |
| `phoenixConservationEndgame: true` | 50.0% — never fires |
| `smartWishSelection: true` | 49.9% — neutral |
| `partnerHandAwarePassing: true` | **47.6%** — actively harmful |
| `preferAceOverPhoenix: true` | 49.3% — slight loss |
| `aceSaveOnLowTricks: true` | **48.5%** — actively harmful (−3.0 pp) |

## Adding a new flag

1. Add to `BotConfig` interface and `DEFAULT_BOT_CONFIG`.
2. Implement the gated behavior in BotAI.
3. Validate with `versus-tier-sim.ts` (10K games, position-swapped).
4. Ship only if win rate > 52% over baseline.
5. Update this doc.

## Lessons from tuning history

- Card passing strategy has the biggest impact. `passAceToPartner` is the biggest single
  win measured (+52.5%).
- Dog play timing (always play it) was the second biggest.
- Leading low for partner without an actual Tichu call is **catastrophically** bad.
- Most parameters near tested optima are at diminishing returns. Filters > flags is the
  recurring lesson.
