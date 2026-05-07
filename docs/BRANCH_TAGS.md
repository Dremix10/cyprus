# Bot Branch Tag Reference

Every bot decision in `chooseLeadHard` and `chooseFollowHard` is tagged via
`this.tag('lead:...')` or `this.tag('follow:...')`. The tag is recorded on
`BotAI.lastBranch` and persisted in `event.data.bot.branchTag` for every PLAY/PASS/BOMB.

Use `npx tsx packages/server/src/instrument-sim.ts 1000 medium` to see fire-rate
distribution.

Source: [`packages/server/src/BotAI.ts`](../packages/server/src/BotAI.ts) — search for
`this.tag(`.

## Lead branches (`chooseLeadHard`)

In priority order — each branch returns immediately if it fires.

| Tag | Fires when | Action | Approx fire rate (medium tier) |
|---|---|---|---|
| `lead:endgame-dump` | `hand.length <= 3` | Play biggest playable | ~30% |
| `lead:dog` | Dog in hand AND (partner Tichu OR `partnerCards <= dogPlayPartnerCards` OR `hand.length <= dogPlayMaxCards`) AND partner not out | Play Dog (gives lead to partner) | ~7% |
| `lead:mahjong` | Mahjong in hand | Play Mahjong (cheapest, gets it out of the way + sets up wish) | ~8% |
| `lead:partner-tichu-low` | Partner called Tichu/GT and isn't out | Lead lowest non-special single (let partner win and take the lead) | <1% |
| `lead:vs-tichu-multi` | Opp Tichu active AND have a strong multi (pair K+, trip, 5+ straight, full house) | Lead the strongest such combo | <1% |
| `lead:vs-tichu-ace` | Opp Tichu active AND have Ace single AND `aceSingleIsUnbeatable` is false | Lead Ace single | <1% |
| `lead:vs-tichu-high` | Opp Tichu active AND have a King-or-higher single | Lead highest such single | <1% |
| `lead:vs-tichu-dragon` | Opp Tichu active AND `leadDragonAgainstTichu` config is true (default off) | Lead Dragon | 0% (off by default) |
| `lead:long-5plus` | Have a non-Ace-pair-containing combo of length ≥ 5 | Lead longest, lowest-rank | ~15% |
| `lead:isolated-multi` | Have a "captured" pair/trip (all in this combo) | Lead longest such | ~25% |
| `lead:multi` | Any multi-card combo | Lead longest, lowest-rank | <1% |
| `lead:singleton` | Have any unique-rank non-special single | Lead lowest such (with unbeatable-Ace guard) | ~14% |
| `lead:low-single` | Have any non-special single | Lead lowest (with unbeatable-Ace guard) | <1% |
| `lead:safe-high-single` | All higher cards are accounted for via `cardInfo` | Lead the safe-top single | <1% |
| `lead:fallback` | Nothing else fires | Lead lowest playable | rare |

## Follow branches (`chooseFollowHard`)

In priority order:

| Tag | Fires when | Action | Approx fire rate |
|---|---|---|---|
| `follow:endgame-urgency` | `hand.length <= 3 AND regular plays exist AND (partner not winning OR self-Tichu)` | Play lowest regular | ~17% |
| `follow:bomb-opp-tichu-thin` | Have bomb AND opp Tichu caller is winning AND has ≤ 5 cards | Bomb (lowest) | <1% |
| `follow:bomb-block-opp-out` | Partner winning AND opp about to go out | Bomb (lowest) | <1% |
| `follow:pass-partner-winning` | Partner winning (and not the bomb-block case) | **Pass** | ~13% |
| `follow:bomb-opp-1-card` | `opponentCardCountBombing` flag AND min opp cards = 1 | Bomb | 0% (flag off) |
| `follow:bomb-opp-2-card` | `opponentCardCountBombing` flag AND min opp cards = 2 | Bomb | 0% (flag off) |
| `follow:bomb-opp-3-tichu` | `opponentCardCountBombing` flag AND min opp ≤ 3 AND opp Tichu AND trick ≥ 5 pts | Bomb | 0% (flag off) |
| `follow:bomb-high-points` | Trick points ≥ `bombPointThreshold` (15) | Bomb | <1% |
| `follow:bomb-10pts-urgent` | Trick ≥ 10 pts AND (opp about to go out OR opp Tichu) | Bomb | <1% |
| `follow:bomb-endgame-clear` | `hand.length <= bombEndgameCards` (5) | Bomb | <1% |
| `follow:pass-leadback-ace-cost` | Partner led but got beaten AND trick ≤ 0 pts AND hand > 8 AND only beat costs an Ace | **Pass** | <1% |
| `follow:bomb-no-regular` | No regular plays AND `shouldUseBombHard` returns true | Bomb | <1% |
| `follow:pass-no-regular` | No regular plays AND can't justify bomb | **Pass** | <1% |
| `follow:smart-select` | `findBestFollowCard` returns a play (this is the main scoring path) | Play returned cards | **~46%** |
| `follow:dragon-play` | Lowest beat is Dragon AND trick ≥ `dragonFollowMinPoints` (10) OR endgame | Play Dragon | ~2% |
| `follow:pass-dragon-save` | Lowest beat is Dragon AND not worth it | **Pass** | ~2% |
| `follow:pass-phoenix-save` | Lowest beat is Phoenix AND can be overtaken (per `cardInfo`) OR low-rank no-urgency | **Pass** | <1% |
| `follow:pass-ace-pointless` | Cheapest beat is Ace AND trick ≤ 0 pts AND hand > 10 | **Pass** | <1% |
| `follow:play-opp-about-out` | Lowest beat is something normal AND opp about to go out | Play lowest | ~3% |
| `follow:play-lowest-beat` | Default — lowest beat exists | Play lowest | ~12% |

## How to use this for debugging

1. After a real game, fetch the `bot_play_reports` from the admin endpoint:
   ```
   curl https://aegist.dev/admin/api/bot-reports -H "Authorization: Bearer $DATA_API_KEY"
   ```
2. Note which `branch_tag` is reported by multiple distinct users.
3. Open `BotAI.ts`, search for `this.tag('that-branch')`, read the surrounding logic.
4. The full bot decision context is in `event.data.bot.*` on each `game_events` row
   (hand, trickTop, trickPoints, oppCardCounts, tichuCalls, currentTrickPlays, wish,
   finishOrder, scores).

## How to add a new tag

- Pick a name following the existing convention: `lead:foo` or `follow:bar`.
- Insert `this.tag('lead:foo')` immediately before the `return …;` of the new branch.
- Re-run `instrument-sim.ts 1000 medium` and confirm it shows up.
- Document it here with one row in the right table.
