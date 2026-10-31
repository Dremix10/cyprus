# Screenshots

Captured 2026-10-31 from the final app (commit `a77e099`, version 1.0) on a local server with
showcase data: 32 per style (2 locales × 2 sizes × 8), all native captures, 8-bit RGB PNG, no alpha. **Upload `final/<locale>/<size>/`** (caption frames). `final-plain/` has the same
screens without frames. Raw captures and bursts stay in `raw/` (gitignored).

## Sizes (Apple's spec page, read 2026-10-30)

`ios.supportsTablet` is `false`, so the app is iPhone only. No iPad screenshots.

| ASC slot | Captured on | Pixels (portrait) | Status |
|---|---|---|---|
| **iPhone 6.3" (Dynamic Island, medium)** | iPhone 17 Pro simulator ("Titsu Shots 6.3", created for this and deleted after) | **1206×2622** | **Required.** Apple: "At least one screenshot for iPhone with Dynamic Island (medium display)." |
| iPhone 6.9" (Dynamic Island, large) | iPhone 17 Pro Max simulator | **1320×2868** | Optional, recommended (also covers 6.5"). |
| iPhone 6.5" (Face ID, large) | | | Not needed when 6.9" is provided. |
| Smaller iPhones | | | Scaled automatically by ASC. |

Both sizes are native captures, not resized. PNG, no alpha channel. 8 per size per locale (limit 10).
Locales: **en-US** and **el**. **en-GB** reuses the en-US files.

## Story (upload in this order)

| # | File | Scene | Caption EN | Caption EL |
|---|---|---|---|---|
| 1 | `01-hero-table` | The table mid-round: cards on the trick, the fanned hand, bot seats, score bar. Picked from a capture burst. | Real Tichu, in your pocket | Αληθινό Τίτσου, στην τσέπη σου |
| 2 | `02-grand-tichu` | **Grand Tichu?** with 8 cards that include the Dragon or Phoenix (the flow re-deals until it sees one). | Call Grand Tichu, if you dare | Grand Tichu; Αν τολμάς |
| 3 | `03-play-your-way` | Signed-in home: "Andreas", Play Online with "Online games go to 500 points", Create Room / Join Room, Solo Game, links row. | Online, with friends or solo | Online, με την παρέα ή μόνος |
| 4 | `04-friends-table` | Waiting room: room code, "Game to 1000", Andreas + Μαρία + Kostas Lim seated, "Empty seats will be filled by bots", Invite friend. | Invite your friends to the table | Κάλεσε την παρέα στο τραπέζι |
| 5 | `05-gods` | A special card being resolved at the table against Bot Zeus / Athena / Apollo (the Dragon, the Dog, the Mahjong wish). Picked from the same burst. | Take on Zeus, Athena and Apollo | Κόντρα στους θεούς του Ολύμπου |
| 6 | `06-leaderboard` | Your Stats (#7, ELO 1498, peak 1531, W/L, Tichu, Grand, 1-2), Recent (wins, a loss, a tie), ranked list from Στέλιος Κ 1648. | Climb the ELO leaderboard | Ανέβα στην κατάταξη ELO |
| 7 | `07-victory` | **Victory!** / **Νίκη!** game-over screen with team scores. | Win it as a team | Η νίκη είναι ομαδική |
| 8 | `08-greek-ui` (en-US) / `08-how-to-play` (el) | en-US: the Greek home screen (shows the bilingual UI). el: How to Play, step 1 of 19 (welcome). | Play in Greek or English | Πρώτη φορά; Μάθε βήμα βήμα |

Captions are in `tools/captions.tsv` (Georgia Bold, gold on navy; Greek glyphs verified).

## Showcase data (local server only)

`tools/seed-showcase.mjs` on a disposable server at 127.0.0.1:3321: the phone's owner **Andreas**
(`andreas_cy`), 17 Greek/Cypriot regulars (Στέλιος Κ 1648 … Φρόσω 1321), 6 friends (Μαρία, Kostas
Lim and Panikos kept online by `friends-online.mjs`), and 9 finished games for Andreas (online and
vs Hard/Extreme bots, wins, losses and a tie). Bots are the real product names (Bot Zeus,
Bot Athena, Bot Apollo). No `qa_*` names appear.

## Tooling (`tools/`)

| File | What it does |
|---|---|
| `shots-server.sh` | Disposable server on **127.0.0.1:3321**, own temp dir/DB (`$TMPDIR/titsu-shots-server`), reusing the built `packages/server/dist` + `packages/client/dist-prod`. Refuses 3301/3311/3001. `start / seed [--reset-bots] / friends / status / logs / stop`. |
| `shots-common.mjs` | localhost-only guard, showcase account and players, register/login/befriend helpers. |
| `seed-showcase.mjs` | Writes the showcase data above. Only writes to a DB path containing `titsu-shots-server`. |
| `friends-online.mjs` | Keeps Μαρία, Kostas Lim and Panikos online; they accept invites one by one and leave old rooms. |
| `flows/*.yaml` | Maestro flows per scene, EN or EL (`-e LOCALE=el`). `sub/autoplay-until-round-over.yaml` plays with Hint and holds the wish / Dragon sheets for ~4 s so a burst catches them. |
| `shoot.sh` | `SIM_UDID=<device> ./shoot.sh <en-US|el> <scenes…|all>`: runs the flow, then captures. Scene `01` runs a capture burst during autoplay. |
| `capture.sh` | `prep` (boot + status bar 9:41, 100 % battery not charging, 4 bars, 3 wifi bars), `shot`, `burst`, `clear`. Saves to `raw/<size>/<locale>/` by pixel size. Refuses the shared iPhone 17 Pro / 16e. |
| `finalize.sh` | `raw/<size>/<locale>/NN-*.png` → `final/<locale>/<size>/` (frames) + `final-plain/<locale>/<size>/`. Checks exact sizes and strips alpha. |

## Re-shooting

```bash
cd apps/mobile/app-store/screenshots/tools
./shots-server.sh start && ./shots-server.sh seed
./shots-server.sh friends &                                   # for scene 04

# Screenshot build (simulator only, never upload it): Release, ad-hoc signed, OTA off.
DD=$TMPDIR/titsu-shots-dd
(cd ../../../ios && EXPO_PUBLIC_SERVER_URL=http://localhost:3321 xcodebuild -workspace Titsu.xcworkspace \
  -scheme Titsu -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath $DD CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build)
APP=$DD/Build/Products/Release-iphonesimulator/Titsu.app
plutil -replace EXUpdatesEnabled -bool NO $APP/Expo.plist
plutil -replace EXUpdatesCheckOnLaunch -string NEVER $APP/Expo.plist
codesign --force --sign - --timestamp=none $APP
strings $APP/main.jsbundle | grep -c localhost:3321   # 1
strings $APP/main.jsbundle | grep -c aegist.dev       # 0

PM=AAE1CDC7-7B0C-4E4E-A904-8CAF1491E1A7                   # iPhone 17 Pro Max (6.9)
P63=$(xcrun simctl create "Titsu Shots 6.3 (17 Pro)" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5)
# A new simulator copies this Mac's 24-hour clock setting and would show "09:41". Remove it, then boot.
xcrun simctl boot $P63; xcrun simctl spawn $P63 defaults delete -g AppleICUForce24HourTime; xcrun simctl shutdown $P63
for U in $PM $P63; do SIM_UDID=$U ./capture.sh prep; xcrun simctl install $U $APP; done

for U in $PM $P63; do
  SIM_UDID=$U ./shoot.sh en-US 03 02 04 06 07 greek 01
  SIM_UDID=$U ./shoot.sh el    03 02 04 06 07 08 01
done
# pick 01-hero-table + 05-gods from raw/<size>/<locale>/burst/ (copy to raw/<size>/<locale>/)
./finalize.sh
./capture.sh clear; xcrun simctl shutdown $P63; xcrun simctl delete $P63; ./shots-server.sh stop
```

Picking burst frames: a good hero has several cards on the trick (ideally a special card or a
bomb), most of the hand still fanned, and no sheet or toast covering it. For `05-gods`, take a
frame with a special card being resolved (the Dragon, the Dog's lead pass, the Mahjong wish).
Run `tools/contact-sheet.sh <size> <locale>` to get labelled thumbnail grids of a burst
(near-duplicate frames are skipped).

## What was picked (2026-10-31)

| Set | 01-hero-table | 05-gods |
|---|---|---|
| 6.9 en-US | Bot Zeus's 5-5-Phoenix on the trick, 13-card hand | Bot Apollo's Dragon, "Bot Apollo is choosing" |
| 6.9 el | Mahjong on the trick, "Ευχή: A", "Η σειρά σου · παίξε την ευχή (A)", Ace raised ("Παίξε 1") | The Dog: "Σκύλος → η σειρά περνάει στον/στην Bot Athena" |
| 6.3 en-US | Aces full raised, "Play 5", over Bot Apollo's full house; full hand | Bot Zeus's Dragon, "Bot Zeus is choosing" |
| 6.3 el | 6-6-6-J-J raised, "Παίξε 5", over Bot Apollo's 2-2-2-K-K; full hand | The Dog: "Σκύλος → η σειρά περνάει στον/στην Bot Athena" |

The human seat never drew the wish or Dragon-give sheet in these rounds, so the gods shots show
the bots resolving special cards instead.
