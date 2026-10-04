# Titsu (Cyprus) — native iPhone client

A phone window onto the live game at https://aegist.dev. The server is the judge; this app only draws
`game:state` and sends actions. Not an npm workspace (Expo uses React 19, the website React 18).
Types and a few runtime enums come from `packages/shared/src` via `metro.config.js`.

- Bundle id `dev.aegist.titsu`, EAS owner `growzone-cy`, Expo SDK 54, New Architecture.
- Greek hall (night blue, gold meander, columns), same lobby as the website. Liquid Glass on the floating plates (`components/GlassSurface.tsx`); cards stay solid. Real Liquid Glass needs iOS 26; older iPhones get a frosted blur with a gold rim.
- Sign in with Apple, email/password, and Google when the server has a client id. The phone stores the session token in the keychain and sends it as `Authorization: Bearer`. The website still uses the HttpOnly cookie. Apple sign-in on the live server needs this server build deployed.

## Run

    npm install
    npx expo run:ios --configuration Release --device <simulator udid>
    maestro --device <udid> test e2e/flows/02-play-and-reconnect.yaml   # needs network; plays on aegist.dev

## TestFlight status

Blocked on the Apple Developer account (enrollment pending, see Anna Nails' pre-launch checklist). Once it exists:
create the App Store Connect app for the bundle id, `eas init`, `eas build -p ios --profile testflight`,
`eas submit -p ios --profile testflight` (set `ascAppId` in `eas.json`). Do not reuse Anna Nails' ascAppId.
