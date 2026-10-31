# Age rating questionnaire

App Store Connect > Titsu > **App Information** > Age Ratings > Edit. These answers use Apple's
current questionnaire, the 2025 system with 4+ / 9+ / 13+ / 16+ / 18+. **Expected result: 4+.**

ASC today (from `eas metadata:pull`, 2026-10-30) already has every item set to None / No. The only
change recommended below is **Contests → Infrequent** (still 4+). `store.config.js` carries the same
answers as `advisory`, so `eas metadata:push` would set them too.

## Step 1: In-app controls and capabilities

| Question | Answer | Why |
|---|---|---|
| Parental Controls | **No** | None in the app. |
| Age Assurance | **No** | No age checks. |
| Unrestricted Web Access | **No** | No in-app browser or free web navigation. `expo-web-browser` is only for the Google OAuth sheet, which is hidden on iOS. |
| User-Generated Content | **No** (judgment call, see below) | The only user-written text is a nickname or display name (max 20 chars, restricted characters) shown at the table, in friends and on the leaderboard. There are no posts, messages, photos, audio or feeds. |
| Messaging and Chat | **No** | Checked: there is no chat in the app or server. Friend requests and table invites are fixed system actions ("X invited you"), with no free text. |
| Advertising | **No** | No ad SDKs. |

**User-Generated Content, the honest view:** Apple defines it as "broad distribution of content
created by users ... such as videos, photos, text, or audio". User names are the one gray area.
Under the new tables, even **Yes** keeps the app at 4+ (only social-media feeds raise it). But
answering Yes invites Guideline 1.2 expectations: report a user, block a user, filter offensive
content. The app has a nickname "may be offensive" warning (`RoomManager.ts`) and admin-side
removal, but no in-app report or block. **Recommendation: No.** If App Review pushes back, add a
"Report player" option and answer Yes.

## Step 2: Content questions

| Section | Question | Answer |
|---|---|---|
| Mature Themes | Profanity or Crude Humor | None |
| | Horror/Fear Themes | None |
| | Alcohol, Tobacco, or Drug Use or References | None |
| | Mature or Suggestive Themes | None |
| Medical or Wellness | Medical or Treatment Information | None |
| | Health or Wellness Topics | No |
| Sexuality or Nudity | Sexual Content or Nudity | None |
| | Graphic Sexual Content and Nudity | None |
| Violence | Cartoon or Fantasy Violence | None (the Dragon is just a card; no combat) |
| | Realistic Violence | None |
| | Prolonged Graphic or Sadistic Realistic Violence | None |
| | Guns or Other Weapons | None (the profile avatar picker includes ⚔️ for Ares and 🔱 for Poseidon as small emoji icons, with no weapon use or depiction) |
| Chance-Based Activities | **Simulated Gambling** | **None** |
| | **Contests** | **Infrequent** (recommended) |
| | Gambling (real money) | No |
| | Loot Boxes | No |

**Simulated gambling, the honest view:** Apple: "betting or wagering without real money or in-game
currency that can be exchanged for real money". Tichu is a partnership trick-taking game in the
Bridge family. There are no chips, coins, currency, stakes, casino games or random rewards. Calling
"Tichu" or "Grand Tichu" is a scoring declaration (+/-100 or +/-200 game points), like a contract bid
in Bridge or a nil bid in Spades. So **None** is accurate. One wrinkle: the tutorial text says Grand
Tichu is "a bold bet". Rewording it to "a bold call" removes any doubt for a reviewer.

**Contests:** Apple now defines it as "events where users compete for rankings, rewards, or personal
goals ... skill-based competitions". There are no tournaments, events or prizes, but online games do
feed a public ELO leaderboard. **Infrequent** is the accurate middle ground and keeps 4+ (Frequent
would make it 13+). None is defensible too, and also gives 4+.

## Step 3: Age categories and override

- **Not Applicable.** Do **not** choose "Made for Kids". It is irreversible after approval and brings
  Kids-category rules (no external links, strict data rules). The app also has online play with
  strangers.
- No override. Age Suitability URL: leave empty.

## Equivalent `advisory` block (also in `store.config.js`)

```json
{
  "alcoholTobaccoOrDrugUseOrReferences": "NONE",
  "contests": "INFREQUENT_OR_MILD",
  "gambling": false,
  "gamblingSimulated": "NONE",
  "gunsOrOtherWeapons": "NONE",
  "horrorOrFearThemes": "NONE",
  "lootBox": false,
  "matureOrSuggestiveThemes": "NONE",
  "medicalOrTreatmentInformation": "NONE",
  "healthOrWellnessTopics": false,
  "profanityOrCrudeHumor": "NONE",
  "sexualContentGraphicAndNudity": "NONE",
  "sexualContentOrNudity": "NONE",
  "violenceCartoonOrFantasy": "NONE",
  "violenceRealistic": "NONE",
  "violenceRealisticProlongedGraphicOrSadistic": "NONE",
  "unrestrictedWebAccess": false,
  "userGeneratedContent": false,
  "messagingAndChat": false,
  "advertising": false,
  "parentalControls": false,
  "ageAssurance": false,
  "kidsAgeBand": null,
  "ageRatingOverride": "NONE",
  "ageRatingOverrideV2": "NONE",
  "koreaAgeRatingOverride": "NONE",
  "developerAgeRatingInfoUrl": null
}
```

Source: Apple, "Age ratings values and definitions" (App Store Connect Help), read 2026-10-30.
