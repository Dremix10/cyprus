---
name: Bots must never break a bomb
description: Hard rule for bot heuristics and MC pre-filters — any play that uses 1-3 cards of a rank where the bot holds all 4 is forbidden, regardless of game phase.
type: project
originSessionId: c75fca32-bc25-48f5-8df6-e297a06f5e1a
---
The bot must NEVER break up a four-of-a-kind bomb in its hand. If the hand has all 4 cards of some rank (a bomb), no play that uses 1, 2, or 3 of those cards is allowed. The only valid play that touches those cards is playing the full bomb (all 4).

**Why:** A bomb is one of the strongest assets in Tichu — it beats any non-bomb combo and is the bot's defense against opponent Aces, Dragons, and high multi-card combos. Splitting it into a triple or pair to form a full house, straight, etc. trades a top-tier strategic resource for a moderate immediate gain. The user calls this "stupid" and rejects any "endgame is different" reasoning.

**How to apply:** Filter candidate plays in *all* lead and follow branches (heuristic and MC pre-filter) before scoring/picking:
- Compute the set of bomb-ranks in hand: ranks where the player holds all 4 cards.
- Reject any play that includes 1–3 cards of a bomb-rank. The bomb itself (all 4) is fine.
- Apply this in `chooseLeadHard`, `chooseLeadMedium`, `chooseFollowHard`, `chooseFollowMedium`, `findBestFollowCard`, the MC pre-filter (`scoreCandidateHeuristic` / `preFilterCandidates`), and in BotAI's `choosePlay` MC candidate filtering alongside the existing Phoenix/Dragon pre-filters.

This is a no-exception rule. Don't propose an "in endgame this is fine" carve-out.
