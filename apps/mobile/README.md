# Titsu (Cyprus) — native iPhone client

A phone window onto the live game at https://aegist.dev. The server is the judge; this app only draws
`game:state` and sends actions. Not an npm workspace (Expo uses React 19, the website React 18).
Types and a few runtime enums come from `packages/shared/src` via `metro.config.js`.

- Bundle id `dev.aegist.titsu`, EAS owner `growzone-cy`, Expo SDK 54, New Architecture.
- Greek hall (night blue, gold meander, columns), same lobby as the website. Liquid Glass on the floating plates (`components/GlassSurface.tsx`); cards stay solid. Real Liquid Glass needs iOS 26; older iPhones get a frosted blur with a gold rim.
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
Build 4 (`0.1.0`, guest client) completed and was submitted successfully on 2026-10-04.
The redesigned client with native sign-in still needs a new build after the server update:
`eas build -p ios --profile testflight`, then `eas submit -p ios --profile testflight --id <build-id>`.
Apple authentication must also be enabled for the App ID's signing profile; a simulator cannot verify real Apple account sign-in.
