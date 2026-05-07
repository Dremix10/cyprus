# Cyprus / Tichu Documentation

Reference docs for the project. Read [`PROJECT_HANDOFF.md`](../PROJECT_HANDOFF.md) at the
repo root first.

## Onboarding

- [`FIRST_30_MINUTES.md`](FIRST_30_MINUTES.md) — concrete sequence to get a dev env, run
  the smoke tests, see a bot game, and understand the layout.

## Reference

- [`BOT_CONFIG.md`](BOT_CONFIG.md) — `DEFAULT_BOT_CONFIG` defaults, what each flag does,
  and the list of flags that have been tested-and-rejected (do NOT enable).
- [`BRANCH_TAGS.md`](BRANCH_TAGS.md) — every `lead:` and `follow:` tag in `BotAI`,
  what it means, and roughly how often it fires.
- [`SOCKET_EVENTS.md`](SOCKET_EVENTS.md) — every Socket.IO event with payload shape and
  a one-line description.
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — every table with column-level docs and
  notes on the `ALTER TABLE` migration approach.

## Notes / decisions / experiments

- [`notes/bot_ai_tuning_results.md`](notes/bot_ai_tuning_results.md) — full record of the
  10K-game tuning experiments, MC budget tests, tier ladder measurements, and Batch 1/2/3
  negative results.
- [`notes/bot_never_break_bomb.md`](notes/bot_never_break_bomb.md) — the hard rule: a
  bot must never split a 4-of-a-kind in hand. No exceptions.
- [`notes/feedback_simulations.md`](notes/feedback_simulations.md) — workflow lessons
  for simulation work (validate framework first, MC takes 17–25 min for 50 games, etc.).
