// EAS Metadata config for Titsu (https://docs.expo.dev/eas/metadata/schema/).
// Built from the text files in ./metadata and ./review so there is one source of truth.
//
// Preview (password masked):   node apps/mobile/app-store/store.config.js
// Push (LATER, not in phase 1): add "metadataPath": "./app-store/store.config.js" to
//   eas.json submit.<profile>.ios, then `cd apps/mobile && eas metadata:push -e <profile>`.
//
// Secrets never live in this file (the repo is public):
//   - review password: env TITSU_REVIEW_PASSWORD, else parsed from review/demo-account.local.md
//   - review contact + copyright: review/contact.local.json (copy contact.example.json)
// Options:
//   TITSU_KEYWORDS=extended        use metadata/<locale>/keywords_extended.txt where present
//   TITSU_INCLUDE_RELEASE_NOTES=1  include release_notes.txt (not allowed on an app's first version)
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (...p) => {
  const file = path.join(ROOT, ...p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : undefined;
};

function localeInfo(locale) {
  const r = (f) => read('metadata', locale, f);
  const keywordsFile =
    process.env.TITSU_KEYWORDS === 'extended' && r('keywords_extended.txt') ? 'keywords_extended.txt' : 'keywords.txt';
  const info = {
    title: r('name.txt'),
    subtitle: r('subtitle.txt'),
    description: r('description.txt'),
    keywords: (r(keywordsFile) || '').split(',').filter(Boolean),
    promoText: r('promotional_text.txt'),
    supportUrl: r('support_url.txt'),
    marketingUrl: r('marketing_url.txt'),
    privacyPolicyUrl: r('privacy_url.txt'),
  };
  if (process.env.TITSU_INCLUDE_RELEASE_NOTES === '1') info.releaseNotes = r('release_notes.txt');
  for (const k of Object.keys(info)) if (info[k] === undefined) delete info[k];
  return info;
}

function reviewPassword() {
  if (process.env.TITSU_REVIEW_PASSWORD) return process.env.TITSU_REVIEW_PASSWORD;
  const md = read('review', 'demo-account.local.md');
  const m = md && md.match(/\|\s*Password\s*\|\s*`([^`]+)`/);
  return m ? m[1] : undefined;
}

function contact() {
  const raw = read('review', 'contact.local.json');
  if (!raw) return {};
  const c = JSON.parse(raw);
  delete c._comment;
  return c;
}

const locales = fs
  .readdirSync(path.join(ROOT, 'metadata'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const owner = contact();
const review = {
  firstName: owner.firstName,
  lastName: owner.lastName,
  email: owner.email,
  phone: owner.phone,
  demoUsername: 'appreview',
  demoPassword: reviewPassword(),
  demoRequired: false,
  notes: read('review', 'notes.txt'),
};
for (const k of Object.keys(review)) if (review[k] === undefined) delete review[k];

const config = {
  configVersion: 0,
  apple: {
    // App Store Connect now requires versionString when EAS updates the release info.
    version: '1.0',
    ...(owner.copyright ? { copyright: owner.copyright } : {}),
    categories: [['GAMES', 'GAMES_CARD', 'GAMES_BOARD']],
    release: { automaticRelease: false, phasedRelease: false },
    info: Object.fromEntries(locales.map((l) => [l, localeInfo(l)])),
    advisory: {
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      contests: 'INFREQUENT_OR_MILD',
      gambling: false,
      gamblingSimulated: 'NONE',
      gunsOrOtherWeapons: 'NONE',
      horrorOrFearThemes: 'NONE',
      lootBox: false,
      matureOrSuggestiveThemes: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      healthOrWellnessTopics: false,
      profanityOrCrudeHumor: 'NONE',
      sexualContentGraphicAndNudity: 'NONE',
      sexualContentOrNudity: 'NONE',
      violenceCartoonOrFantasy: 'NONE',
      violenceRealistic: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
      unrestrictedWebAccess: false,
      userGeneratedContent: false,
      messagingAndChat: false,
      advertising: false,
      parentalControls: false,
      ageAssurance: false,
      kidsAgeBand: null,
      ageRatingOverride: 'NONE',
      ageRatingOverrideV2: 'NONE',
      koreaAgeRatingOverride: 'NONE',
      developerAgeRatingInfoUrl: null,
    },
    review,
  },
};

module.exports = config;

if (require.main === module) {
  const shown = JSON.parse(JSON.stringify(config));
  if (shown.apple.review.demoPassword) shown.apple.review.demoPassword = '********';
  console.log(JSON.stringify(shown, null, 2));
  const missing = ['firstName', 'lastName', 'email', 'phone', 'demoPassword'].filter((k) => !config.apple.review[k]);
  if (!config.apple.copyright) missing.push('copyright');
  if (missing.length) console.error(`\nStill missing (fill review/contact.local.json): ${missing.join(', ')}`);
}
