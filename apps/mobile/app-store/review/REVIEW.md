# App Review information

Paste these into App Store Connect > Titsu > iOS App (version page) > **App Review Information**.

| ASC field | Value / source |
|---|---|
| Sign-in required | Leave **unticked**. Guest play covers the core game. Still fill in the demo account so review can test Friends, Profile and deletion. |
| User name | `appreview` |
| Password | in `demo-account.local.md` (gitignored, local only) |
| Contact first/last name, phone, email | **Owner to fill.** Template: `contact.example.json` → `contact.local.json` |
| Notes | the full text of [`notes.txt`](notes.txt) (2,570 chars, limit 4,000) |
| Attachment | none needed |

## Demo account

- Created on **production** (https://aegist.dev) on 2026-10-30 with the real `POST /auth/register`
  endpoint: username `appreview`, display name `App Review`, email `appreview@aegist.dev`, user id 13.
- Verified: the iPhone login path (`x-cyprus-client: ios` returns a Bearer token), `/auth/me`, logout.
- The email is on your own domain. aegist.dev has Spaceship mail forwarding (MX `efwd.spaceship.net`).
  Add a forward for `appreview@` only if you ever want reset mail. SMTP is not configured anyway.
- The account has no games yet, so it is "Unranked" on the Leaderboard. That is fine. Everyone else's
  rankings still show.
- If App Review deletes it, recreate it with the snippet in `demo-account.local.md` and update ASC.

## Guest play vs sign-in (what review will see)

- **Guest:** the lobby asks only for a nickname (max 20 chars). Solo, Play Online, Create Room and
  Join Room all work without an account. Guest games are stored by nickname and IP, not by account.
- **Signed in:** Sign in with Apple, or username + password (registration needs username, password
  of 8+ chars, display name and email). Google sign-in is hidden on iOS because production has no
  `GOOGLE_IOS_CLIENT_ID`. Signed-in players get the ELO leaderboard entry (after 3 online games),
  personal stats, recent games, friends, invites, avatar and display name.
- Guideline 4.8 (Login Services) is satisfied: Sign in with Apple is offered next to the only other
  login option (own accounts). Google is not offered on iOS.

## Testing multiplayer alone

- **Solo vs bots** is the reliable path (see notes). Quick game = 1 round, about 3 to 5 minutes.
- **Play Online**: the server starts a match after 60 s even with only one human and fills the other
  seats with bots (`MatchmakingManager.matchGroupSize`: 4 players at once, 3 after 30 s, 2 after 45 s,
  anyone after 60 s). So review never waits forever.
- **Private room**: Start game fills empty seats with bots. Friend invites need a second account.

## Account deletion: BLOCKER, must be fixed before submitting

Apple requires apps that let people create an account to also let them start **deleting that
account inside the app** (Guideline 5.1.1(v)).

**Current state (checked 2026-10-30):**

1. `apps/mobile/components/MoreScreens.tsx` `ProfileScreen` has avatar, display name, **Sign Out**,
   and no **Delete Account** button. The store already has `useAuth().deleteAccount(password)`
   (`lib/authStore.ts`) calling `POST /auth/delete-account`. Only the UI is missing.
   i18n already has `profile.deleteAccount`, `profile.deleteWarning`, `profile.enterPasswordConfirm`,
   `profile.yesDeleteAccount` in EN and EL.
2. **Server bug:** `bot_play_reports.reporter_user_id REFERENCES users(id)` has no `ON DELETE`
   action, and `foreign_keys = ON`. Deleting a user who ever tapped **Report a bug** throws
   `FOREIGN KEY constraint failed` (reproduced with sqlite3). The async route has no try/catch,
   so the request hangs and the app shows "Connection failed". `deleteAllUserSessions` has already
   run, so the user is signed out but the account still exists. Fix in `AuthService.deleteAccount` /
   `Database.deleteUser`: delete or anonymise that user's `bot_play_reports` rows first (or migrate the
   FK to `ON DELETE CASCADE`), wrap it in a transaction, and return JSON errors.
3. Sign in with Apple accounts have an empty password hash, so the server already lets them delete
   with an empty password (`AuthService.deleteAccount`). The UI must **not** ask them for a password:
   show the password field only when `user.hasPassword` is true.

**What the review notes promise (build it like this):** Lobby > tap your display name > Profile >
**Delete Account** (red, below Sign Out) > warning text (`profile.deleteWarning`) > password field
if `hasPassword` > **Yes, delete my account** > signed out, back to the lobby. If the final UI
differs, update the deletion paragraph in `notes.txt` before submitting.

**Recommended (Apple asks for it, rarely enforced):** when an account that used Sign in with Apple
is deleted, revoke its Apple tokens with the Sign in with Apple REST API (`/auth/revoke`). That needs
the authorization code from the app (`cred.authorizationCode`) plus a Sign in with Apple private key
on the server. The server receives only the identity token today. Not a launch blocker in practice,
but worth adding.

**Website copy:** `/privacy` already says deletion removes "login, profile, friends, and account
settings" and that some game records and logs may be kept. That matches the code: `game_players.user_id`
and `connections.user_id` stay as bare numbers after the user row is gone.

## Other things review may trip on

- **The production server is older than the app.** `https://aegist.dev/health` shows
  `startedAt 2026-10-05`, before commit `70c0404` (2026-10-12, one-tap game lengths). That server
  clamps a target score of 0 up to 250, so **Quick game becomes a 250-point game** for review, and
  any other newer server behaviour is missing too. Deploy the current server (with the deletion fix)
  before you submit, then confirm `/health` shows a new `startedAt`.
- In-game screens are partly **hard-coded English** in the current tree (`PhaseViews.tsx` Grand
  Tichu, passing, round over and game over; `WaitingRoom.tsx`; `RulesSheet.tsx`; the Live Games
  screen). The listing says "Play in Greek or English", which is true for the lobby, leaderboard,
  friends, profile and tutorial. Finish the in-game strings before the Greek screenshots, or keep
  the Greek screenshots to translated screens.
- The tutorial calls Grand Tichu "a bold bet". It is a scoring call, like a bid in Bridge. Consider
  rewording it to "a bold call" so a reviewer does not read it as simulated gambling.
- The Apple sign-in sheet still needs one retry on a real iPhone with the final build
  (the simulator cannot finish real Apple sign-in; see `apps/mobile/README.md`).
