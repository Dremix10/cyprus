> **Applied 2026-10-31** to `packages/client/src/i18n.ts` and `LegalPages.tsx` (operator Demetris Chrysostomou, support@aegist.dev, 12-month retention). Kept below for reference.

# Privacy policy: what to change before App Review

Live page: https://aegist.dev/privacy (from `packages/client/src/components/LegalPages.tsx` and the
`legal.*` keys in `packages/client/src/i18n.ts`, EN + EL). It already covers what is collected, how
it is used, deletion and "we do not sell player data". Apple Guideline 5.1.1(i) also expects it to
name the app and operator, list every third party, give retention, and say how to request deletion.
**Gaps found:**

| # | Gap | Why it matters |
|---|---|---|
| 1 | Calls the service "Cyprus" and never mentions **Titsu** or the iPhone app. | The reviewer opens the link from the Titsu listing. |
| 2 | **Sign in with Apple** is not mentioned. Third parties list only Google and an email provider. | The app collects the Apple user id plus an optional name and email. |
| 3 | **Expo** (app updates) and **DigitalOcean** (hosting) are not mentioned. | Every service that receives user data should be listed. |
| 4 | Mentions cookies and "local browser storage" only. | On iPhone the session token is kept in the **iOS Keychain**, and settings in app storage. |
| 5 | No **contact email**. Contact points to the GitHub repo. | Users need a direct way to send privacy and deletion requests. Also improves the Support URL. |
| 6 | No **retention period**. In practice, `connections`, `http_requests` and `game_events` are never pruned. Only `server_logs` is. | Apple asks for retention and deletion policies. Either add pruning or state the real practice. |
| 7 | No **operator name** (who runs the service). | Add the individual developer name that appears as the App Store seller. |

The website code lives outside `apps/mobile/app-store` and was not changed. Below is drop-in copy.
Replace `<OPERATOR>` (the App Store seller name) and `<EMAIL>` (for example `support@aegist.dev`,
which Spaceship forwarding can deliver), and pick a real retention number.

## Suggested English text (additions / replacements)

**Intro (replace `legal.privacy.intro`):**
> Titsu (the iPhone app) and aegist.dev are an online Tichu card game run by <OPERATOR>. We collect
> only the information needed to run accounts, games, matchmaking, support, security and basic game
> statistics. We do not sell player data and we do not use it for advertising or tracking.

**Add to "Information We Collect":**
> - If you use Sign in with Apple: the anonymous Apple user identifier, plus your name and email
>   address if you choose to share them (Apple may give us a private relay address).
> - On iPhone, your sign-in token is stored in the iOS Keychain, and your language choice and
>   reconnect details are stored in the app's local storage.
> - App updates are delivered by Expo, which receives a random install identifier and basic
>   device and app version information when the app checks for updates.

**Replace `legal.privacy.third`:**
> We use these service providers: Apple (Sign in with Apple), Google (Google Sign-In on the website,
> if enabled), Expo (app update delivery), DigitalOcean (server hosting in our own account), and an
> email provider for password-reset emails if enabled. They only receive what they need to provide
> their service. We do not sell player data or share it for advertising.

**Add "Retention":**
> Account data is kept until you delete your account. Game results, connection and request logs,
> including IP addresses, are kept for up to <N> months for security, fair play and statistics, and
> then deleted or anonymized. Server diagnostic logs are kept for a shorter period.

**Replace `legal.privacy.deletion`:**
> You can delete your account at any time in the app: open Profile (tap your name in the lobby) and
> choose Delete Account. On the website, use Delete Account in your profile. Deleting removes your
> login, profile, friends, sessions and settings immediately. Some game records (without your
> account details), scores, reports, security logs and anti-abuse records may be kept for the
> retention period above so games stay fair and the service stays protected. You can also email
> <EMAIL> to request deletion or a copy of your data.

**Contact (`legal.contact.intro`):** add "Email: <EMAIL>" above the GitHub link.

## Προτεινόμενο ελληνικό κείμενο

**Εισαγωγή:**
> Το Titsu (η εφαρμογή για iPhone) και το aegist.dev είναι ένα online παιχνίδι Tichu που λειτουργεί
> ο/η <OPERATOR>. Συλλέγουμε μόνο ό,τι χρειάζεται για λογαριασμούς, παιχνίδια, matchmaking,
> υποστήριξη, ασφάλεια και βασικά στατιστικά. Δεν πουλάμε δεδομένα παικτών και δεν τα
> χρησιμοποιούμε για διαφημίσεις ή παρακολούθηση.

**Προσθήκη στις «Πληροφορίες που συλλέγουμε»:**
> - Αν χρησιμοποιείς Σύνδεση με Apple: το ανώνυμο αναγνωριστικό χρήστη της Apple και, αν επιλέξεις
>   να τα μοιραστείς, το όνομα και το email σου (η Apple μπορεί να μας δώσει διεύθυνση αναμετάδοσης).
> - Στο iPhone, το διακριτικό σύνδεσης φυλάσσεται στο iOS Keychain, ενώ η γλώσσα και τα στοιχεία
>   επανασύνδεσης αποθηκεύονται τοπικά στην εφαρμογή.
> - Τις ενημερώσεις της εφαρμογής τις παραδίδει η Expo, η οποία λαμβάνει ένα τυχαίο αναγνωριστικό
>   εγκατάστασης και βασικές πληροφορίες συσκευής και έκδοσης όταν η εφαρμογή ελέγχει για ενημερώσεις.

**Τρίτες υπηρεσίες:**
> Χρησιμοποιούμε τους εξής παρόχους: Apple (Σύνδεση με Apple), Google (Google Sign-In στον ιστότοπο,
> αν είναι ενεργό), Expo (ενημερώσεις εφαρμογής), DigitalOcean (φιλοξενία του διακομιστή μας) και
> πάροχο email για emails επαναφοράς κωδικού, αν είναι ενεργά. Λαμβάνουν μόνο ό,τι χρειάζονται για την
> υπηρεσία τους. Δεν πουλάμε δεδομένα παικτών ούτε τα μοιραζόμαστε για διαφημίσεις.

**Διατήρηση δεδομένων:**
> Τα στοιχεία του λογαριασμού διατηρούνται μέχρι να τον διαγράψεις. Αποτελέσματα παιχνιδιών, αρχεία
> συνδέσεων και αιτημάτων, μαζί με διευθύνσεις IP, διατηρούνται έως <N> μήνες για λόγους ασφάλειας,
> δίκαιου παιχνιδιού και στατιστικών και μετά διαγράφονται ή ανωνυμοποιούνται.

**Διαγραφή λογαριασμού:**
> Μπορείς να διαγράψεις τον λογαριασμό σου όποτε θέλεις μέσα από την εφαρμογή: άνοιξε το Προφίλ
> (πάτησε το όνομά σου στο lobby) και επίλεξε Διαγραφή Λογαριασμού. Στον ιστότοπο, χρησιμοποίησε τη
> Διαγραφή Λογαριασμού στο προφίλ σου. Η διαγραφή αφαιρεί αμέσως τη σύνδεση, το προφίλ, τους φίλους,
> τις συνεδρίες και τις ρυθμίσεις σου. Ορισμένα αρχεία παιχνιδιών (χωρίς τα στοιχεία του λογαριασμού
> σου), σκορ, αναφορές και αρχεία ασφάλειας μπορεί να διατηρηθούν για το παραπάνω διάστημα. Μπορείς
> επίσης να ζητήσεις διαγραφή ή αντίγραφο των δεδομένων σου στο <EMAIL>.

After deploying: bump `legal.updated` in both languages and check https://aegist.dev/privacy loads
in Safari on an iPhone (it is a client-rendered page, so make sure it is not blank without JS errors).
