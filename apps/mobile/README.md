# Titsu (Cyprus) — native iPhone client

A phone window onto the live game at https://aegist.dev. The server is the judge; this app only draws
`game:state` and sends actions. Not an npm workspace (Expo uses React 19, the website React 18).
Types and a few runtime enums come from `packages/shared/src` via `metro.config.js`.

- Bundle id `dev.aegist.titsu`, EAS owner `growzone-cy`, Expo SDK 54, New Architecture.
- Greek hall (night blue, gold meander, columns), same lobby as the website. Liquid Glass on the floating plates (`components/GlassSurface.tsx`); cards stay solid. Real Liquid Glass needs iOS 26; older iPhones get a frosted blur. Reduce Transparency uses solid surfaces.
- Sign in with Apple, email/password, and Google when the server has `GOOGLE_IOS_CLIENT_ID` (an iOS OAuth client for this bundle id). The website uses its separate `GOOGLE_CLIENT_ID`. The phone stores the session token in the keychain and sends it as `Authorization: Bearer`. The website still uses the HttpOnly cookie. Mobile account sessions and Apple sign-in need this server build deployed. Apple token verification uses the bundle id, overridable via `APPLE_BUNDLE_ID`.

## Run on a simulator

`npx expo run:ios` fails on this Mac with `No code signing certificates are available`: the Sign in
with Apple entitlement needs a signing team. Build with `xcodebuild` and ad-hoc signing instead.
`EXPO_PUBLIC_SERVER_URL` is baked into the JS bundle at build time, so point it at the local QA server
(below). Keep build products in a scratch folder, not `ios/build`.

    npm install
    UDID=<simulator udid>     # xcrun simctl list devices available
    DD=<scratch folder>/dd
    cd ios && EXPO_PUBLIC_SERVER_URL=http://localhost:3301 xcodebuild -workspace Titsu.xcworkspace -scheme Titsu \
      -configuration Release -sdk iphonesimulator -destination id=$UDID -derivedDataPath $DD \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build

Then turn off OTA updates in the built app, so expo-updates can't swap in the production bundle,
re-sign it, install it, and check which server it talks to:

    APP=$DD/Build/Products/Release-iphonesimulator/Titsu.app
    plutil -replace EXUpdatesEnabled -bool NO $APP/Expo.plist
    plutil -replace EXUpdatesCheckOnLaunch -string NEVER $APP/Expo.plist
    codesign --force --sign - --timestamp=none $APP
    xcrun simctl boot $UDID; xcrun simctl install $UDID $APP
    strings $APP/main.jsbundle | grep -c localhost:3301   # 1
    strings $APP/main.jsbundle | grep -c aegist.dev       # 0

Never submit this simulator artifact. Session-persistence tests require Xcode's simulator keychain
entitlements; ad-hoc signing removes them.

## Local QA server

A disposable copy of the built server on localhost with a fresh SQLite database. It never touches
production, and the helpers refuse any URL that isn't localhost. Needs a root `npm run build` once
(`packages/server/dist`, `packages/client/dist-prod`).

    e2e/helpers/qa-server.sh start   # copy server + website into $QA, start on :3301
    e2e/helpers/qa-server.sh seed    # qa_host / qa_friend / qa_friend2 (password qa-password-123) + 14 ranked players
    e2e/helpers/qa-server.sh stop

`PORT=3321` runs a second, separate server (default folder `$TMPDIR/titsu-qa-server-<port>`, or set
`QA=<folder>`) for a second simulator built with a matching `EXPO_PUBLIC_SERVER_URL`.

## Maestro flows

Start and seed the QA server, then run from `apps/mobile`:

    maestro --device $UDID test e2e/flows/05-quick-game.yaml

| Flow | Checks | Also needs |
| --- | --- | --- |
| 01-solo-round | Guest solo: Grand Tichu, pass three, first plays | |
| 02-play-and-reconnect | Illegal-play toast, Hint, kill and reopen mid-game | |
| 03-auth-panel | Sign-in and register forms open without Google | |
| 04-table-reconnect | Restart at the table with the saved ticket | |
| 05-quick-game | "Online games go to 500 points" on home; length picker in Create Room and Solo; quick-game waiting room; a quick game played to the end | |
| 06-settings-sheet | Table gear, sound toggle, Score History sheet, backdrop close | |
| 07-leaderboard-header | Fixed header, signed-in stats, nickname can be cleared | |
| 08-friend-invite | Invite from the lobby creates a room; length under the code | `node e2e/helpers/qa-friend.mjs friend` |
| 09-invite-from-waiting-room | Second invite goes into the same room | `qa-friend.mjs friend` and `qa-friend.mjs friend2` |
| 10-game-starts-behind-friends | Friend starts the game while Friends is open | `START_AFTER_MS=8000 node e2e/helpers/qa-friend.mjs friend` |
| 11-delete-account | Register a throwaway account, wrong password refused, delete it, sign-in then fails | |

The friend helpers stay online and auto-accept invites. They exit after 15 minutes (`QA_TIMEOUT_S=900`;
raise it for a long run). Stop them (Ctrl-C) between 09 and 10, then stop the QA server. They use `http://localhost:3301` unless `QA_SERVER_URL` says otherwise.
`sub/sign-in-qa-host.yaml` signs in as `qa_host`.

## TestFlight status

EAS project `growzone-cy/titsu` is linked and App Store Connect app `6819067929` is configured in `eas.json`.
Build 9 (`0.1.0`, commit `f063fe5`) is VALID / IN_BETA_TESTING for internal testers as of 2026-10-05.
EAS build `4c58d35d-1528-4b3c-ae47-8a84cf834b7c`, submission `f5a7dab0-802c-49a8-ada8-fde19a2b0aca`.
The signed IPA was verified to use Xcode 26 / iOS 26.0 and the production server URL, with no localhost QA URL.
Use build 9; build 8 was already submitted before the final control fix.
To ship the current client (EAS builds with `https://aegist.dev` and submits to App Store Connect):
`eas build -p ios --profile testflight --auto-submit --non-interactive`.
Or in two steps: `eas build -p ios --profile testflight`, then `eas submit -p ios --profile testflight --id <build-id>`.
Apple authentication must also be enabled for the App ID's signing profile; a simulator cannot verify real Apple account sign-in.

## Device feedback — 2026-10-05

- Production logs showed Apple token verification succeeded, but new accounts failed with `NOT NULL constraint failed: users.password_hash`. The original users table differs from fresh test databases. `createUser` now stores an empty passwordless sentinel, preserving the existing schema and account IDs. Apple and Google regression tests cover the legacy table, password-login rejection, session validation, and existing password accounts.
- The compatibility fix (`e77c53d`) was deployed over SSH with zero active games/connections. Both providers were verified on an isolated copy of the actual production database; no QA accounts were added to production. A real Apple sheet retry is still needed on an iPhone.
- The server is currently deployed from an archive, without `.git`; `/health` reports `commit: unknown`. The latest GitHub deployment timed out on SSH; the workflow also expects a git checkout. The hotfix deployed only `Database.ts` and `dist/Database.js`, with backups beside those files.
- Zeus uses the website's existing bundled artwork. Clear native glass replaces the opaque gold tint and clipping wrapper; UIKit draws its own rounded lens. The native glass is a stable backdrop behind ordinary React Native controls. The close icon uses vector strokes and stays visible after game updates. Greek table styling adds a bronze oval, laurel leaves, columns, and an actual meander.
- Leaderboard includes current/peak ELO, rank, games, wins/losses, win rate, first outs, Tichu/Grand success ratios, double victories, rounds, and five recent scores. Tap any ranked player to expand the same detailed stats. Data comes from the existing leaderboard/me/history APIs; no server stats changes are needed.
- Root build and all 383 shared/server tests passed, plus mobile typecheck. Release simulator checks passed for sign-in, personal stats/recent results, expanded rankings, solo Grand Tichu/passing/play, table controls, leaving a game, and reconnect. Release simulator QA uses `localhost:3301` and an isolated disposable database. Never submit that simulator artifact; EAS defaults to `https://aegist.dev`.
