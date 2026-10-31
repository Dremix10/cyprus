# Marketing version

**Decision (2026-10-30): ship as `1.0`.** It matches the version App Store Connect already
prepared, so nothing has to change there. `app.json` is now `"version": "1.0"`, and the store
build uses the new `production` profile in `eas.json` (OTA channel `production`, so updates to
`preview` never reach App Store users). Next versions: `1.0.1`, `1.1`, and so on.

The original recommendation below (1.0.0) is kept for context. Either works; `1.0` saves an
App Store Connect edit.

---

**Earlier recommendation: ship the first public release as `1.0.0`.**

## What exists today (checked 2026-10-30)

| Where | Value |
|---|---|
| `app.json` → `expo.version` | `0.1.0` |
| `app.json` → `runtimeVersion.policy` | `appVersion`, so the OTA runtime equals the marketing version |
| `eas.json` → `cli.appVersionSource` | `remote`. EAS manages the **build number** only. The marketing version still comes from `app.json`. |
| `eas.json` → `build.testflight.ios.autoIncrement` | `true`. EAS builds 3 to 9 exist, all `0.1.0`; the next build becomes 10 |
| App Store Connect version (from `eas metadata:pull`) | **`1.0`**, prepared and never submitted (only the en-US title "Titsu" is filled in) |
| Ever released? | **No.** `itunes.apple.com/lookup?id=6819067929` and `?bundleId=dev.aegist.titsu` return 0 results |

## Why 1.0.0 and not 0.1.0

- It is the first public release. Users read 0.x as an unfinished beta.
- ASC already prepared "1.0". The build's version string has to match the App Store version it is
  attached to, so a `0.1.0` build does not fit the current page anyway.
- Nothing was released before, so there is no ordering constraint. Any version is allowed now, and
  later versions only need to be higher.
- Semver `1.0.0` keeps future `1.0.1` / `1.1.0` clean, and gives a fresh OTA runtime that
  TestFlight `0.1.0` builds will not accidentally receive.

## What to change (I did not edit these; they are outside `app-store/`)

1. **`apps/mobile/app.json`:** `"version": "0.1.0"` → `"version": "1.0.0"`.
   Leave `ios.buildNumber` unset. EAS (remote source, autoIncrement) assigns 10, 11, and so on.
2. **App Store Connect:** on the iOS App version page, change the version field **`1.0` → `1.0.0`**
   (editable while it is "Prepare for Submission"). Or leave ASC at `1.0` and set `app.json` to
   `"1.0"`. The two must match exactly.
3. **Optional but recommended, `apps/mobile/eas.json`:** the store build uses the `testflight`
   profile with update channel `preview`. Any OTA update published to `preview` would then reach
   App Store users. Before launch, either add a `production` build profile (same as `testflight` but
   `"channel": "production"`) and a matching `submit.production` with `ascAppId`, or accept that
   `preview` is your production channel.
4. **For EAS Metadata later (optional):** add `"metadataPath": "./app-store/store.config.js"` under
   the submit profile's `ios` (for example `submit.testflight.ios`), then `eas metadata:push -e testflight`.
   Do this only after step 2, so the editable version matches. `store.config.js` deliberately does
   not set `apple.version`, so it updates whatever version is currently editable.

## Check commands (read-only)

```bash
cd apps/mobile
eas build:version:get -p ios        # current remote build number (expect 9)
eas build:list --platform ios --limit 3 --non-interactive
npx expo config --type public | grep -E '"version"|runtimeVersion' -A1
```

After the version bump, the release build is `1.0.0 (10)`. Its runtime version is `1.0.0`, so
publish OTA updates for it with that runtime only.
