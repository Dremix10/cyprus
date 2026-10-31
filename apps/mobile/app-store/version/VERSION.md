# Marketing version

**Decision (2026-10-30): ship the first public release as `1.0`.** It matches the version App
Store Connect already prepared, so nothing has to change there. Next versions: `1.0.1`, `1.1`, and so on.

## Current state (checked 2026-10-31)

| Where | Value |
|---|---|
| `app.json` → `expo.version` | **`1.0`** (done, commit `31d62e0`) |
| `app.json` → `runtimeVersion.policy` | `appVersion`, so the OTA runtime is `1.0` |
| `eas.json` → `cli.appVersionSource` | `remote`. EAS manages the **build number** only; the marketing version comes from `app.json` |
| `eas.json` → `build.production` | **New store profile:** `distribution: store`, OTA `channel: production`, `autoIncrement`, `EXPO_PUBLIC_SERVER_URL=https://aegist.dev`. Updates published to `preview` (TestFlight) never reach App Store users. |
| `eas.json` → `submit.production.ios` | `ascAppId 6819067929`, `metadataPath ./app-store/store.config.js` |
| Earlier TestFlight builds | 3 to 9, all `0.1.0` (`testflight` profile, channel `preview`) |
| App Store Connect version | **`1.0`**, prepared, never submitted |
| Ever released? | **No.** `itunes.apple.com/lookup?id=6819067929` and `?bundleId=dev.aegist.titsu` return 0 results |

## Why 1.0

- It is the first public release; 0.x reads as an unfinished beta.
- The build's version string has to match the App Store version it is attached to. ASC already
  has `1.0`, so `1.0` needs no App Store Connect edit. (`1.0.0` would have worked too, but needs the
  ASC field renamed.)
- Nothing was released before, so there is no ordering constraint. Later versions only need to be higher.
- A new runtime (`1.0`) means OTA updates made for the `0.1.0` TestFlight builds never apply to the store build.

## Build and upload (agent / owner, when ready)

```bash
cd apps/mobile
eas build -p ios --profile production            # -> 1.0 (10 or higher), points at https://aegist.dev
eas submit -p ios --profile production --id <build-id>
# optional, later: eas metadata:push -e production   (uses ./app-store/store.config.js)
```

Read-only checks:

```bash
eas build:version:get -p ios          # current remote build number
eas build:list --platform ios --limit 3 --non-interactive
npx expo config --type public | grep -E '"version"|runtimeVersion' -A1
```

Publish OTA updates for the store build only to channel `production` with runtime `1.0`.
