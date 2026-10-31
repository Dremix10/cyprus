# Screenshot plan (phase 2)

## Required sizes (Apple's spec page, read 2026-10-30)

`ios.supportsTablet` is `false`, so the app is iPhone only. No iPad screenshots.

| ASC slot | Devices | Accepted portrait px | Status for Titsu |
|---|---|---|---|
| **iPhone 6.3" (Dynamic Island, medium)** | iPhone 17 / 17 Pro / 16 Pro | 1206×2622 or 1179×2556 | **Required.** Apple's "Required device sizes" now names this one: "At least one screenshot for iPhone with Dynamic Island (medium display)." |
| iPhone 6.9" (Dynamic Island, large) | iPhone 17 Pro Max / Air / 16 Pro Max | **1320×2868**, 1290×2796, 1260×2736 | Optional but recommended (largest, shown on Pro Max). Our native capture size. |
| iPhone 6.5" (Face ID, large) | 11 Pro Max, XS Max… | 1284×2778, 1242×2688 | **Not needed:** only required when no 6.9" set is provided. |
| Smaller iPhones | | | Scaled automatically by ASC. |

- Up to 10 per size per locale. PNG or JPEG, **no alpha** (`finalize.sh` flattens and checks).
- Upload **both** 6.9 (1320×2868) and 6.3 (1206×2622) for **en-US** and **el**. If you add the
  optional **en-GB** localization, reuse the en-US images.
- This changed from the 2024 to 2025 rule ("6.9 or 6.5 required"). If ASC still shows a red
  "required" badge on 6.5" when you upload, add the 6.9 files there too. ASC accepts them by spec.

## Story (8 shots per locale, in upload order)

The first 3 do the selling in search results. Each line: what's on screen, then captions (EN / EL).
Captions live in `tools/captions.tsv` for optional framed versions (`finalize.sh --captions`).

| # | File | Scene | Caption EN | Caption EL |
|---|---|---|---|---|
| 1 | `01-hero-table` | Table mid-trick: a **Dragon, Phoenix or bomb** on the trick, a full fanned hand, bot seats with names, score bar. Picked from a capture burst. | Real Tichu, in your pocket | Αληθινό Τίτσου, στην τσέπη σου |
| 2 | `02-grand-tichu` | **Grand Tichu?** decision with 8 strong cards (Dragon or Phoenix plus Aces). Re-deal until it looks good. | Call Grand Tichu, if you dare | Grand Tichu; Αν τολμάς |
| 3 | `03-play-your-way` | Signed-in lobby: name "Andreas", Game length chips with **Quick game** selected, Play Online / Create Room / Join / Solo Game, gold Greek-hall look. | Online, with friends or solo | Online, με την παρέα ή μόνος |
| 4 | `04-friends-table` | **Waiting room**: big room code, Andreas + Μαρία + Kostas Lim seated, "Empty seats will be filled by bots", Invite friend button. | Invite your friends to the table | Κάλεσε την παρέα στο τραπέζι |
| 5 | `05-gods` | **Solo vs the gods**: the Dragon give sheet ("Give the trick to an opponent": Bot Zeus / Bot Apollo) or the Mahjong wish grid, with bot names visible. Picked from the same burst as #1. | Take on Zeus, Athena and Apollo | Κόντρα στους θεούς του Ολύμπου |
| 6 | `06-leaderboard` | **Leaderboard**: Andreas's stats (rank, ELO 1498, peak, W/L, Tichu ratio), Recent wins and losses, the ranked list (Στέλιος Κ, Μαρία, Kostas Lim…). | Climb the ELO leaderboard | Ανέβα στην κατάταξη ELO |
| 7 | `07-victory` | **Victory!** game-over screen, team scores. | Win it as a team | Η νίκη είναι ομαδική |
| 8 | `08-greek-ui` (en-US) / `08-how-to-play` (el) | en-US set: the **Greek lobby** (proves the bilingual UI). el set: **How to Play**, step 3, special cards. | Play in Greek or English | Πρώτη φορά; Μάθε βήμα βήμα |

Optional extras (slots 9 and 10): the Friends list with "· Online" badges; the passing screen
("Pass three cards"); the round-over score card with "Double victory +200".

**Before shooting the el set:** in-game screens are partly hard-coded English (see
`../review/REVIEW.md`). If that is not fixed by phase 2, keep the el set to translated screens
(lobby, leaderboard, friends, how to play) and use table shots without English buttons, or accept
English buttons on table frames.

## Tooling (`tools/`)

| File | What it does |
|---|---|
| `shots-server.sh` | Disposable local server on **127.0.0.1:3321**, its own temp dir/DB (`$TMPDIR/titsu-shots-server`). Refuses 3301/3311/3001. Reuses the existing `packages/server/dist` and `packages/client/dist-prod` (no root build). `start / seed / friends / status / logs / stop`. |
| `shots-common.mjs` | Copy of `e2e/helpers/qa-common.mjs` for 3321: localhost-only guard, showcase account, the 17 Greek-named regulars, register/login/befriend. |
| `seed-showcase.mjs` | Leaderboard players with Greek names (Στέλιος Κ 1648 … Φρόσω 1321, Andreas at 1498), stats, avatars, 6 friends, 8 finished games for Andreas (online and vs Hard/Extreme bots, wins and losses). `--reset-bots` hides bot rows. Writes only to a DB path containing `titsu-shots-server`. |
| `friends-online.mjs` | Keeps Μαρία, Kostas Lim and Panikos online. They auto-accept invites, staggered so the seats fill one by one. |
| `flows/*.yaml` | Maestro flows per scene (`sub/` = sign in as andreas_cy, set language, autoplay a round with Hint). |
| `shoot.sh` | Runs a scene flow, then captures. `shoot.sh en-US all`, `shoot.sh el 06`, etc. Scene 01 runs a capture burst while autoplaying. |
| `capture.sh` | `prep` (boot the 17 Pro Max + status bar `9:41`, charged, 100 %, 4 bars, 3 wifi bars), `shot`, `burst`, `clear`. Flattens alpha and warns if not 1320×2868. Refuses the iPhone 17 Pro / 16e UDIDs. |
| `finalize.sh` | `raw/<loc>/NN-*.png` → `final/6.9/<loc>/` (1320×2868) + `final/6.3/<loc>/` (1206×2622, uniform downscale + 1 px crop). `--captions` makes gold-on-navy marketing frames (Georgia Bold, Greek glyphs verified). |
| `captions.tsv` | Captions per scene, EN + EL. |

## Phase-2 run sheet

Simulator: **iPhone 17 Pro Max** `AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7` (iOS 26.5). Never touch the
iPhone 17 Pro (`4D4CE469…`), the 16e devices, or ports 3301/3311.

```bash
cd apps/mobile/app-store/screenshots/tools

# 0. Server + data (dist must be current; it was built 2026-10-30 20:28)
./shots-server.sh start
./shots-server.sh seed

# 1. Screenshot build pointed at the local server (Release, so it looks like the store build)
#    Coordinate first: apps/mobile/ios and DerivedData are shared with other agents' builds.
cd ../../.. && EXPO_PUBLIC_SERVER_URL=http://localhost:3321 \
  npx expo run:ios --configuration Release --device AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7
cd app-store/screenshots/tools
#    Never upload this build anywhere: it points at localhost.

# 2. Clean status bar
./capture.sh prep

# 3. Scenes. Scene 04 needs the friends running in a second terminal:
./shots-server.sh friends        # (terminal 2, leave running)
./shoot.sh en-US 03 02 04 06 07 greek
./shoot.sh en-US 01              # burst -> raw/en-US/burst/table-NN.png; pick 01-hero-table + 05-gods
./shoot.sh el 03 02 04 06 07 08
./shoot.sh el 01                 # pick el 01 + 05

# 4. Review raw/<locale>/*.png by eye (names, no debug UI, no "Waiting"), then
./finalize.sh                    # plain
./finalize.sh --captions         # or framed with captions (pick one style for both locales)
./capture.sh clear && ./shots-server.sh stop
```

Picking frames: open `raw/<loc>/burst/` in Finder (Quick Look, space bar). For #1, the best frame
has a special card or a bomb on the trick, your hand still mostly full, and no sheet covering it.
For #5, take the Dragon-give or Mahjong-wish sheet. If a burst misses them, run `./shoot.sh <loc> 01`
again (new deal), or set `BURST_COUNT=150`.

Known flow risks (debug in phase 2): `04-friends-table.yaml` (Invite from the waiting room then
back to the room), and `autoplay-until-round-over.yaml` (Hint/Play/Pass timing). If a flow
stalls, drive by hand on the simulator and use `./capture.sh shot <loc> <name>`.
