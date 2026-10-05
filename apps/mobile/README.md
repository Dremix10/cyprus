# Titsu (Cyprus) — native iPhone client

A phone window onto the live game at https://aegist.dev. The server is the judge; this app only draws
`game:state` and sends actions. Not an npm workspace (Expo uses React 19, the website React 18).
Types and a few runtime enums come from `packages/shared/src` via `metro.config.js`.

- Bundle id `dev.aegist.titsu`, EAS owner `growzone-cy`, Expo SDK 54, New Architecture.
- Greek hall (night blue, gold meander, columns), same lobby as the website. Liquid Glass on the floating plates (`components/GlassSurface.tsx`); cards stay solid. Real Liquid Glass needs iOS 26; older iPhones get a frosted blur. Reduce Transparency uses solid surfaces.
- Sign in with Apple, email/password, and Google when the server has `GOOGLE_IOS_CLIENT_ID` (an iOS OAuth client for this bundle id). The website uses its separate `GOOGLE_CLIENT_ID`. The phone stores the session token in the keychain and sends it as `Authorization: Bearer`. The website still uses the HttpOnly cookie. Mobile account sessions and Apple sign-in need this server build deployed. Apple token verification uses the bundle id, overridable via `APPLE_BUNDLE_ID`.

## Run

    npm install
    npx expo run:ios --configuration Release --device <simulator udid>
    maestro --device <udid> test e2e/flows/03-auth-panel.yaml
    maestro --device <udid> test e2e/flows/04-table-reconnect.yaml   # needs network; plays on aegist.dev

For isolated simulator QA, set `EXPO_PUBLIC_SERVER_URL` to a disposable local server when bundling.
Session-persistence tests require Xcode's simulator keychain entitlements; disabling code signing removes them.

## TestFlight status

EAS project `growzone-cy/titsu` is linked and App Store Connect app `6819067929` is configured in `eas.json`.
Build 6 (`0.1.0`, commit `3334f62`) completed on 2026-10-05, compiled with Xcode 26 / iOS 26.0.
To ship the current client:
`eas build -p ios --profile testflight`, then `eas submit -p ios --profile testflight --id <build-id>`.
Apple authentication must also be enabled for the App ID's signing profile; a simulator cannot verify real Apple account sign-in.

## Device feedback — 2026-10-05

- Production logs showed Apple token verification succeeded, but new accounts failed with `NOT NULL constraint failed: users.password_hash`. The original users table differs from fresh test databases. `createUser` now stores an empty passwordless sentinel, preserving the existing schema and account IDs. Apple and Google regression tests cover the legacy table, password-login rejection, session validation, and existing password accounts.
- The compatibility fix (`e77c53d`) was deployed over SSH with zero active games/connections. Both providers were verified on an isolated copy of the actual production database; no QA accounts were added to production. A real Apple sheet retry is still needed on an iPhone.
- The server is currently deployed from an archive, without `.git`; `/health` reports `commit: unknown`. The latest GitHub deployment timed out on SSH; the workflow also expects a git checkout. The hotfix deployed only `Database.ts` and `dist/Database.js`, with backups beside those files.
- Zeus uses the website's existing bundled artwork. Clear native glass replaces the opaque gold tint and clipping wrapper; UIKit draws its own rounded lens. The native glass is a stable backdrop behind ordinary React Native controls, avoiding controls disappearing after Fabric updates. Greek table styling adds a bronze oval, laurel leaves, columns, and an actual meander.
- Leaderboard includes current/peak ELO, rank, games, wins/losses, win rate, first outs, Tichu/Grand success ratios, double victories, rounds, and five recent scores. Tap any ranked player to expand the same detailed stats. Data comes from the existing leaderboard/me/history APIs; no server stats changes are needed.
- Root build and all 383 shared/server tests passed, plus mobile typecheck. Release simulator QA uses `localhost:3301` and an isolated disposable database. Never submit that simulator artifact; EAS defaults to `https://aegist.dev`.
