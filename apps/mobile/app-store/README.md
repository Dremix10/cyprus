# Titsu: App Store submission kit

Everything needed to submit **Titsu** (`dev.aegist.titsu`, ASC app id `6819067929`, team
`4856X9H6NP`) to the App Store as version **1.0**. Phase 1 (2026-10-30) prepared the copy, review,
privacy, age rating and version. Phase 2 (2026-10-31) captured the screenshots from the final app
(commit `a77e099`).

**Legend:** ✅ done · 🧑 **OWNER** (you, in App Store Connect or a decision) · 🤖 **AGENT**
(I'll do it when you say go) · 🛠 **DEV** (code or server change in the app repo, outside this folder)

## Folder map

| Path | What |
|---|---|
| `metadata/en-US/`, `metadata/el/`, `metadata/en-GB/` | Paste-ready text: `name`, `subtitle`, `promotional_text`, `description`, `keywords` (+ `el/keywords_extended`), `release_notes`, `support_url`, `marketing_url`, `privacy_url` (fastlane-style file names) |
| `metadata/COUNTS.md` | Verified character counts (`node scripts/check-limits.mjs --write`) |
| `store.config.js` | EAS Metadata config built from the files above (validated against eas-cli's schema). Wired to `eas.json` `submit.production`. **Not pushed.** |
| `review/` | `notes.txt` (paste into ASC), `REVIEW.md` (demo account, deletion, risks), `contact.example.json`, `demo-account.local.md` (**gitignored**, has the password) |
| `privacy/` | `APP_PRIVACY.md` (nutrition-label answers), `privacy-policy-update.md` (fixes for aegist.dev/privacy) |
| `age-rating/AGE_RATING.md` | Questionnaire answers. Expected rating **4+** |
| `version/VERSION.md` | Version **1.0** (decided) and the `production` EAS profile |
| `screenshots/final/<locale>/<size>/` | **Upload these.** Caption frames, 8 per set, `en-US` and `el`, `6.9` (1320×2868) and `6.3` (1206×2622), 8-bit PNG, no alpha (26 MB). en-GB reuses en-US. |
| `screenshots/final-plain/<locale>/<size>/` | The same screenshots without frames, if you prefer plain ones (35 MB; don't commit it if you upload the frames) |
| `screenshots/PLAN.md` | Sizes, story, captions, and how to re-shoot |
| `screenshots/tools/` | Local 3321 server, seed, friend bots, Maestro flows, capture/finalize scripts |

## Blockers before you press Submit

| | Item | Status |
|---|---|---|
| ✅ | In-app account deletion (5.1.1(v)) | Done: Profile > Delete Account > confirmation sheet (password only for password accounts). Commit `7d67861`. |
| ✅ | Server: deleting a user who reported a bot play | Fixed in `7781dc4` (reports removed in the same transaction; 500 instead of a hang). |
| ✅ / 🧑 | Production server up to date | `aegist.dev/health` shows `startedAt 2026-10-31T02:26Z`, after `7781dc4`. Confirm that deploy included the current `main` (Quick game, deletion fix). |
| 🧑 | **Support contact:** `support@aegist.dev` is on the contact and privacy pages (2026-10-31). The owner turns on Spaceship email forwarding to their inbox; until then mail to it bounces. | Forwarding: owner |
| ✅ | **Privacy policy:** names Titsu and the operator (Demetris Chrysostomou), Sign in with Apple, Expo, DigitalOcean, Keychain, 12-month log retention (enforced by `pruneOldPersonalData`) and the support email. | Done 2026-10-31 (EN + EL). |
| ✅ | Greek in-game screens, tutorial "a bold call" | Done in `a77e099` / `7d67861`. |

## Decisions for you

1. **Name (decided 2026-10-31): `Titsu: Greek Card Game`** in en-US/en-GB, `Titsu: Τίτσου Online` in el. The hero caption no longer says "Real Tichu". Keywords leave out `tichu` (Guideline 2.3.7: no trademarked terms in keywords). The name can change with any later version. Original note: proposed `Titsu: Tichu Card Game` (best for search). Tichu is
   Fata Morgana's game, and a licensed "Tichu" app is already on the store, so the name carries some
   trademark-complaint risk. The description ends with a "not affiliated" line. Safer alternatives:
   `Titsu: Greek Card Game` (en) and `Titsu: Τίτσου Online` (el, already proposed). With the safer
   name, move `tichu` into the en keywords.
2. **Add an English (U.K.) localization?** Recommended. Greece and Cyprus storefronts default to
   **English (U.K.)** with Greek as the extra language. `metadata/en-GB/` is ready; upload the en-US
   screenshots for it.
3. **Framed or plain screenshots?** `final/` has caption frames (recommended); `final-plain/` has
   the raw screens. Use one style for every locale.
4. **Release:** manual release after approval (recommended for the first launch; `store.config.js` sets it).
5. **Price/territories:** Free. All territories, or at least Cyprus, Greece, UK and US.
6. **Contests age answer:** Infrequent (recommended) or None. Both keep 4+.

Decided: version **1.0** (matches the prepared ASC version, so no ASC edit).

## Submission checklist (in App Store Connect order)

### A. Before App Store Connect
- [ ] 🧑 Update aegist.dev `/privacy` and `/contact` (support email, Titsu, Apple, Expo, retention).
- [x] ✅ `apps/mobile/app.json` `"version": "1.0"`; `eas.json` has the `production` build + submit profiles.
- [ ] 🧑 **EU Digital Services Act trader status** (ASC > Business > Compliance, or the prompt on the
      app page). Required to distribute in EU storefronts, including Cyprus and Greece. If you declare
      yourself a trader, your address, phone and email are shown publicly on EU store pages.
- [x] ✅ Agreements: free apps need only the Apple Developer Program License Agreement.
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
- [x] ✅ Version string is already `1.0`, matching `app.json`.
- [ ] 🧑 Per locale (en-US, el, en-GB): Promotional Text, Description, Keywords, Support URL,
      Marketing URL from `metadata/<locale>/`. Greek keywords: paste `keywords_extended.txt`; if ASC
      says it is too long, use `keywords.txt` (it fits even if Apple counts bytes).
- [ ] 🧑 **Screenshots** (ready, ✅ captured): for each locale, drag
      `screenshots/final/<locale>/6.9/*.png` into **iPhone 6.9"** and
      `screenshots/final/<locale>/6.3/*.png` into **iPhone 6.3"** (the required slot). en-GB: use the en-US files.
- [ ] 🤖 **Build:** `eas build -p ios --profile production` → `1.0 (10+)`, then
      `eas submit -p ios --profile production --id <build-id>`. Wait for "Ready to Submit", then
      🧑 select it under **Build**.
- [ ] 🧑 **Copyright:** `2026 <your seller name>`.
- [ ] 🧑 **App Review Information:** contact name, phone, email. Sign-in: `appreview` plus the password
      from `review/demo-account.local.md` ("Sign-in required" unticked). Notes: paste `review/notes.txt`.
- [ ] 🧑 **Version Release:** "Manually release this version".
- [x] ✅ What's New: not shown for a first version (`release_notes.txt` is ready for 1.0.1).

### F. Final device check (TestFlight build 1.0)
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
  `review/contact.local.json`. `eas.json` `submit.production.ios.metadataPath` already points at it;
  `eas metadata:push -e production` would push (not done). EAS Metadata cannot push screenshots or
  App Privacy, so those stay manual.
- ✅ Screenshots captured from the final app on a local server with showcase data (no QA names),
  clean 9:41 status bar, both sizes natively (iPhone 17 Pro Max and iPhone 17 Pro simulators). See `screenshots/PLAN.md`.

## Useful commands

```bash
node apps/mobile/app-store/scripts/check-limits.mjs --write   # recount after any copy edit
node apps/mobile/app-store/store.config.js                    # preview the EAS config (password masked)
curl -s https://aegist.dev/health                             # which server build is live?
```
