---
name: Simulation workflow feedback
description: User preferences for running bot simulations — time estimates, progress updates, validation-first approach
type: feedback
originSessionId: c75fca32-bc25-48f5-8df6-e297a06f5e1a
---
Always validate simulation framework before testing changes (run identical bots, confirm 50/50).

**Why:** We wasted hours running simulations that were all invalidated by a swap bug. The user was frustrated by the lost time.

**How to apply:**
- Run bias-test.ts (identical bots, no MC, <30 sec) first whenever changing the simulation code
- Be precise and honest about time estimates — never say "2-3 minutes" for something that could take 20+ minutes
- Show detailed progress every 5 games: wins, avg scores, first outs, double victories, tichu calls/success, grand tichu calls/success
- Run MC simulations in the background so the user can still ask questions
- Present plans before executing — especially for long-running tests
- When multiple tests are needed, run them sequentially and show results between each
