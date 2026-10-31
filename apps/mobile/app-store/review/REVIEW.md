# App Review information

Paste these into App Store Connect > Titsu > iOS App (version page) > **App Review Information**.

| ASC field | Value / source |
|---|---|
| Sign-in required | Leave **unticked**. Guest play covers the core game. Still fill in the demo account so review can test Friends, Profile and deletion. |
| User name | `appreview` |
| Password | in `demo-account.local.md` (gitignored, local only) |
| Contact first/last name, phone, email | **Owner to fill.** Template: `contact.example.json` → `contact.local.json` |
| Notes | the full text of [`notes.txt`](notes.txt) (about 2,700 chars, limit 4,000) |
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

## Account deletion (Guideline 5.1.1(v)): done

Apple requires apps that let people create an account to also let them start **deleting that
account inside the app**. Status on 2026-10-31 (commit `a77e099`):

- **App:** Lobby > tap your display name > Profile > scroll down > red **Delete Account** > a sheet
  explains what is deleted and that it is permanent > password field only when `user.hasPassword`
  (Sign in with Apple accounts are not asked) > **Yes, delete my account** > signed out, back in the
  lobby with a "deleted" toast. Built in `7d67861` (`components/MoreScreens.tsx`,
  `DeleteAccountSheet`), covered by the Maestro flow `e2e/flows/11-delete-account.yaml`. The
  deletion paragraph in `notes.txt` matches this UI.
- **Server:** the `bot_play_reports` foreign-key failure (users who had tapped **Report a bug**
  could not be deleted, and the request hung) is fixed in `7781dc4`: their reports are removed in
  the same transaction, and the route answers 500 instead of hanging if deletion throws.
  Production restarted at `2026-10-31T02:26Z`, after that commit.

**Recommended (Apple asks for it, rarely enforced):** when an account that used Sign in with Apple
is deleted, revoke its Apple tokens with the Sign in with Apple REST API (`/auth/revoke`). That needs
the authorization code from the app (`cred.authorizationCode`) plus a Sign in with Apple private key
on the server. The server receives only the identity token today. Not a launch blocker in practice,
but worth adding.

**Website copy:** `/privacy` already says deletion removes "login, profile, friends, and account
settings" and that some game records and logs may be kept. That matches the code: `game_players.user_id`
and `connections.user_id` stay as bare numbers after the user row is gone.

## Other things review may trip on

- **Production server version:** `https://aegist.dev/health` shows `startedAt 2026-10-31T02:26Z`
  (`commit: unknown`, archive deploy). Make sure that deploy is the current `main`, which includes
  one-tap game lengths (Quick game = 1 round; older servers clamp it to 250) and the deletion fix.
- **Greek UI:** done in `a77e099`. With ΕΛ selected, the table, Play / Pass / Hint, the wish and
  Dragon sheets, the waiting room and the scoring screens are Greek. (`RulesSheet.tsx` is still
  English but is not used anywhere.)
- **Tutorial wording:** Grand Tichu is now "a bold call", not "a bold bet".
- The Apple sign-in sheet still needs one retry on a real iPhone with the final build
  (the simulator cannot finish real Apple sign-in; see `apps/mobile/README.md`).
