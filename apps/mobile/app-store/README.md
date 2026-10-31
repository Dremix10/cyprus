# Titsu: App Store submission kit

Everything needed to submit **Titsu** (`dev.aegist.titsu`, ASC app id `6819067929`, team
`4856X9H6NP`) to the App Store. Prepared 2026-10-30. Phase 1 is everything except the final
screenshots. Phase 2 builds the screenshot app and captures them.

**Legend:** ✅ done · 🧑 **OWNER** (you, in App Store Connect or a decision) · 🤖 **AGENT**
(I'll do it when you say go) · 🛠 **DEV** (code or server change in the app repo, outside this folder)

## Folder map

| Path | What |
|---|---|
| `metadata/en-US/`, `metadata/el/`, `metadata/en-GB/` | Paste-ready text: `name`, `subtitle`, `promotional_text`, `description`, `keywords` (+ `el/keywords_extended`), `release_notes`, `support_url`, `marketing_url`, `privacy_url` (fastlane-style file names) |
| `metadata/COUNTS.md` | Verified character counts (`node scripts/check-limits.mjs --write`) |
| `store.config.js` | EAS Metadata config built from the files above (validated against eas-cli's schema). **Not pushed.** |
| `review/` | `notes.txt` (paste into ASC), `REVIEW.md` (demo account, deletion blocker, risks), `contact.example.json`, `demo-account.local.md` (**gitignored**, has the password) |
| `privacy/` | `APP_PRIVACY.md` (nutrition-label answers), `privacy-policy-update.md` (fixes for aegist.dev/privacy) |
| `age-rating/AGE_RATING.md` | Questionnaire answers. Expected rating **4+** |
| `version/VERSION.md` | Why `1.0.0`, and the exact edits to make |
| `screenshots/PLAN.md` | Required sizes, 8-scene story with EN/EL captions, phase-2 run sheet |
| `screenshots/tools/` | Local 3321 server, seed, friend bots, Maestro flows, capture/finalize scripts |

## Blockers: fix before you press Submit

| | Item | Detail |
|---|---|---|
| 🛠 | **In-app account deletion is missing.** `ProfileScreen` has only Sign Out. Apple rejects apps with sign-up but no in-app deletion (5.1.1(v)). | `review/REVIEW.md`: the store function and translations already exist. Add the button, and no password prompt for Apple-only accounts. |
| 🛠 | **Server: delete fails for users who reported a bot play** (`bot_play_reports` FK without cascade, `foreign_keys=ON`). The request hangs and the user ends up signed out but not deleted. | `review/REVIEW.md` |
| 🧑🛠 | **Deploy the current server to aegist.dev.** Production has run since 2026-10-05 and predates one-tap game lengths (`70c0404`). It clamps Quick game (0) up to a 250-point game. | Deploy, then check `curl -s https://aegist.dev/health` shows a new `startedAt` |
| 🧑 | **Support contact:** `aegist.dev/contact` only links the GitHub repo. Add a support email (for example `support@aegist.dev` via Spaceship forwarding) to the contact and privacy pages. | `privacy/privacy-policy-update.md` |
| 🧑 | **Privacy policy gaps:** it never mentions Titsu, Sign in with Apple, Expo, Keychain, retention or an operator name. | `privacy/privacy-policy-update.md` (EN + EL drop-in text) |
| 🛠 | Optional but advised: finish the Greek strings on in-game screens (`PhaseViews`, `WaitingRoom`, `RulesSheet`, Live Games), and change the tutorial's "a bold bet" to "a bold call". | `review/REVIEW.md` |

## Decisions for you

1. **Name: does it include "Tichu"?** Proposed `Titsu: Tichu Card Game` (best for search). Tichu is
   Fata Morgana's game, and a licensed "Tichu" app is already on the store, so the name carries some
   trademark-complaint risk. The description ends with a "not affiliated" line. Safer alternatives:
   `Titsu: Greek Card Game` (en) and `Titsu: Τίτσου Online` (el, already proposed). With the safer
   name, move `tichu` into the en keywords.
2. **Add an English (U.K.) localization?** Recommended. Greece and Cyprus storefronts default to
   **English (U.K.)** with Greek as the extra language, so en-US alone is not what most of your home
   market sees. `metadata/en-GB/` is ready (same copy, British "practise", different keywords).
3. **Version 1.0.0** (recommended) or keep 0.1.0. See `version/VERSION.md`.
4. **Release:** manual release after approval (recommended for the first launch; `store.config.js` sets it).
5. **Price/territories:** Free. All territories, or at least Cyprus, Greece, UK and US.
6. **Contests age answer:** Infrequent (recommended) or None. Both keep 4+.

## Submission checklist (in App Store Connect order)

### A. Before App Store Connect
- [ ] 🛠 Fix the two deletion blockers above. Then 🧑 deploy the server and confirm `/health`.
- [ ] 🧑 Update aegist.dev `/privacy` and `/contact` (support email, Titsu, Apple, Expo, retention).
- [ ] 🧑 or 🤖 Set `apps/mobile/app.json` `"version": "1.0.0"` (tell me and I'll do it at build time).
- [ ] 🧑 **EU Digital Services Act trader status** (ASC > Business > Compliance, or the prompt on the
      app page). Required to distribute in EU storefronts, including Cyprus and Greece. If you declare
      yourself a trader, your address, phone and email are shown publicly on EU store pages.
- [x] ✅ Agreements: free apps need only the Apple Developer Program License Agreement (no paid-apps or banking setup).
- [x] ✅ Export compliance: `ITSAppUsesNonExemptEncryption = false` is in `app.json`, so ASC asks nothing.
- [x] ✅ Sign in with Apple capability on the App ID (production logs show Apple tokens verifying).

### B. App Information (left sidebar > General > App Information)
- [ ] 🧑 **Name** (en-US): `Titsu: Tichu Card Game` (see decision 1). Today ASC has `Titsu`.
- [ ] 🧑 **Subtitle** (en-US): `Online with friends or bots`
- [ ] 🧑 **Localizations:** add **Greek** (name `Titsu: Τίτσου Online`, subtitle `Με την παρέα ή κόντρα σε bots`), and optionally **English (U.K.)**.
- [x] ✅ Primary language English (U.S.), bundle ID, SKU: already set.
- [ ] 🧑 **Category:** Primary **Games**, subcategories **Card** and **Board**. Secondary: none (or Entertainment).
- [ ] 🧑 **Content Rights:** "Contains third-party content?" Answer **No**, but only if you own or have
      rights to the Zeus artwork and card art. Confirm where `assets/images/zeus.png` came from.
- [ ] 🧑 **Age Rating:** answer per `age-rating/AGE_RATING.md` → **4+**.

### C. Pricing and Availability
- [ ] 🧑 Price **Free**. Availability: all territories, or at least CY, GR, GB, US.

### D. App Privacy
- [ ] 🧑 Privacy Policy URL: `https://aegist.dev/privacy` (after the update).
- [ ] 🧑 Data types and purposes: copy `privacy/APP_PRIVACY.md`. Tracking: **No**. Then **Publish**.

### E. Version page (iOS App > 1.0)
- [ ] 🧑 Change the version string **1.0 → 1.0.0** (must match the build).
- [ ] 🧑 Per locale (en-US, el, en-GB): Promotional Text, Description, Keywords, Support URL,
      Marketing URL from `metadata/<locale>/`. Greek keywords: paste `keywords_extended.txt`; if ASC
      says it is too long, use `keywords.txt` (it fits even if Apple counts bytes).
- [ ] 🤖 **Screenshots** for each locale: 6.9" (1320×2868) and **6.3" (1206×2622, the required slot)**. Phase 2: `screenshots/PLAN.md`.
- [ ] 🤖 **Build:** `eas build -p ios --profile testflight` → `1.0.0 (10)`, then
      `eas submit -p ios --profile testflight --id <build-id>`. Wait for "Ready to Submit", then
      🧑 select it under **Build**.
- [ ] 🧑 **Copyright:** `2026 <your seller name>`.
- [ ] 🧑 **App Review Information:** contact name, phone, email. Sign-in: `appreview` plus the password
      from `review/demo-account.local.md` ("Sign-in required" unticked). Notes: paste `review/notes.txt`.
- [ ] 🧑 **Version Release:** "Manually release this version".
- [x] ✅ What's New: not shown for a first version (`release_notes.txt` is ready for 1.0.1).

### F. Final device check (TestFlight build 1.0.0)
- [ ] 🧑 On a real iPhone: Sign in with Apple, then delete that account in Profile; register and
      delete a password account; solo Quick game; Play Online starts with bots after about 60 s;
      airplane-mode toggle reconnects; EN/ΕΛ switch.
- [ ] 🧑 Log in once as `appreview` to make sure it works on the release build.

### G. Submit
- [ ] 🧑 **Add for Review → Submit.** Typical review time is 24 to 48 h. Answer in Resolution Center if asked.
- [ ] 🧑 After approval: **Release**, then check the live listing in both languages.

## Status of what's already prepared

- ✅ Copy written and verified for en-US, el, en-GB (`metadata/COUNTS.md`: all under limits;
  keywords have no spaces, no duplicates, and no name or subtitle words).
- ✅ App Store Connect read (no writes): version `1.0` prepared, only the en-US title filled, age
  answers all None, nothing ever released.
- ✅ Demo account `appreview` created on production and login verified (password only in the gitignored local file).
- ✅ `store.config.js` validates against eas-cli 24.10's metadata schema once you fill
  `review/contact.local.json`. To push later (not now): add `"metadataPath": "./app-store/store.config.js"`
  to the submit profile's `ios` in `eas.json`, then `eas metadata:push -e testflight`. EAS Metadata
  cannot push screenshots or App Privacy, so those stay manual.
- ✅ Screenshot tooling written and syntax-checked. Guards refuse production, ports 3301/3311 and
  the shared simulators. `finalize.sh` tested on synthetic images, including Greek captions.

## Useful commands

```bash
node apps/mobile/app-store/scripts/check-limits.mjs --write   # recount after any copy edit
node apps/mobile/app-store/store.config.js                    # preview the EAS config (password masked)
curl -s https://aegist.dev/health                             # is the new server deployed?
```
