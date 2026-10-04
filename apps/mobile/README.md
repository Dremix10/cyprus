# Titsu (Cyprus) — native iPhone client

A phone window onto the live game at https://aegist.dev. The server is the judge; this app only draws
`game:state` and sends actions. Not an npm workspace (Expo uses React 19, the website React 18).
Types and a few runtime enums come from `packages/shared/src` via `metro.config.js`.

- Bundle id `com.growzonecy.cyprus`, EAS owner `growzone-cy`, Expo SDK 54, New Architecture.
- Liquid Glass only on floating bars (`components/GlassSurface.tsx`); cards and table are solid.
- Guest play only so far. Accounts (cookie `cyprus_auth`) and friends are not started.

## Run

    npm install
    npx expo run:ios --configuration Release --device <simulator udid>
    maestro --device <udid> test e2e/flows/02-play-and-reconnect.yaml   # needs network; plays on aegist.dev

## TestFlight status

Blocked on the Apple Developer account (enrollment pending, see Anna Nails' pre-launch checklist). Once it exists:
create the App Store Connect app for the bundle id, `eas init`, `eas build -p ios --profile testflight`,
`eas submit -p ios --profile testflight` (set `ascAppId` in `eas.json`). Do not reuse Anna Nails' ascAppId.
