# App Privacy ("nutrition label") answers

App Store Connect > Titsu > **App Privacy** > Get Started / Edit. EAS Metadata cannot push this, so
enter it by hand. Answers are derived from the code on 2026-10-30:

- `packages/server/src/Database.ts`: tables `users`, `user_sessions`, `user_stats`, `friendships`,
  `games`, `game_players`, `game_events`, `connections`, `players`, `http_requests`, `server_logs`,
  `bot_play_reports`
- `packages/server/src/AuthService.ts` and `AuthRoutes.ts` (register, login, Apple, Google, delete)
- `apps/mobile` (`package.json`, `lib/authStore.ts`, `components/AuthPanel.tsx`)

## Summary (what the label will show)

**Data Used to Track You:** none.

**Data Linked to You:**
- Contact Info: email address, name
- Identifiers: user ID
- Contacts: the in-app friends list (never the iPhone address book)
- User Content: gameplay content
- Usage Data: product interaction

**Data Not Linked to You:**
- Identifiers: device ID (the Expo update install ID)

There are no analytics, ads, attribution or crash-reporting SDKs in `apps/mobile/package.json`. No
data goes to data brokers or ad networks. There is no App Tracking Transparency prompt and none is
needed.

## Step 1: Data collection

"Do you or your third-party partners collect data from this app?" → **Yes, we collect data from this app.**

## Step 2: Data types (tick exactly these)

| Category | Data type | Tick? | Where it comes from |
|---|---|---|---|
| Contact Info | **Email Address** | Yes | Required to register (`users.email`). Sign in with Apple may share a real or a private-relay email. |
| Contact Info | **Name** | Yes | Sign in with Apple requests `FULL_NAME`. If shared, it becomes the initial display name. |
| Contact Info | Phone, Physical Address, Other | No | Not collected. |
| Health & Fitness, Financial Info, Location, Sensitive Info | (all) | No | Not collected. IPs are logged but never geolocated (see notes). |
| Contacts | **Contacts** | Yes | Apple's definition includes a "social graph". The in-app friends list (`friendships`) is one. The app never reads the iPhone address book. |
| User Content | **Gameplay Content** | Yes | Games, finish order, scores, ELO and stats (`games`, `game_players`, `game_events`, `user_stats`), plus in-game bot reports (`bot_play_reports`). |
| User Content | Emails or Text Messages, Photos/Videos, Audio, Customer Support, Other | No | There is no chat or messaging, and no uploads. Display names and avatar picks are covered by User ID. |
| Browsing History, Search History | (all) | No | The friend search query is not stored. |
| Identifiers | **User ID** | Yes | Account id, username and display name, plus the Apple and Google subject ids (`users.apple_id`, `users.google_id`). |
| Identifiers | **Device ID** | Yes | `expo-updates` sends a random per-install `EAS-Client-ID` to Expo (u.expo.dev) on update checks. Expo keeps it for update statistics. |
| Purchases | (all) | No | No in-app purchases. |
| Usage Data | **Product Interaction** | Yes | Connection records (connect and disconnect times, room, user id: `connections`), per-move game event logs, HTTP request logs (path, status, timing: `http_requests`). Viewed in the admin dashboard. |
| Usage Data | Advertising Data, Other Usage Data | No | |
| Diagnostics | Crash Data, Performance Data, Other | No | No crash or performance SDK in the app. Server-side logs about the server itself are not app diagnostics. |
| Other Data | Other | No | |

## Step 3: For each ticked type

| Data type | Purposes (tick) | Linked to user? | Used for tracking? |
|---|---|---|---|
| Email Address | App Functionality | Yes (stored on the account) | No |
| Name | App Functionality | Yes | No |
| Contacts (friends list) | App Functionality | Yes | No |
| Gameplay Content | App Functionality | Yes (`game_players.user_id`, `user_stats`) | No |
| User ID | App Functionality | Yes | No |
| Product Interaction | App Functionality, Analytics | Yes (`connections.user_id`, game logs) | No |
| Device ID | App Functionality, Analytics | **No** (random install id, never joined to the account by us) | No |

Purpose meanings used above: **App Functionality** covers sign-in, matchmaking, rooms, friends,
scoring, leaderboard, reconnect, security, rate limiting and abuse prevention. **Analytics** covers
the admin dashboard's traffic, game and connection stats, and Expo's update-adoption counts.
Do **not** tick Third-Party Advertising, Developer's Advertising or Marketing, or Product
Personalization. There is no personalization beyond your own settings.

## Notes and judgment calls

- **IP addresses** are stored (connections, guest `players`, `game_players`, `http_requests`,
  `user_sessions`) for security, rate limiting and abuse prevention. Apple does not list IP address
  as a separate data type. It only matters if you derive location from it, and the server does not.
  If you ever add geo-IP, tick **Coarse Location**.
- **Guest play** stores the nickname with the IP (`players`, `game_players`). That is still
  "Gameplay Content". The "linked" answers above already cover it, because signed-in data is linked.
- **Device ID / Expo:** some Expo apps skip this. It is listed because Apple counts data a
  third-party SDK keeps beyond the real-time request, and Expo keeps the install id for update
  insights. If you prefer, removing `expo-updates` (or `updates.url`) removes it.
- **Sign in with Apple** data (stable user id, optional name and email) counts as collected by
  you. That is why Name and Email are ticked.
- **Google Sign-In** is hidden on iOS today (production returns no `iosClientId`). If you enable it,
  nothing changes in the label (email, name and user id are already declared).
- **Hosting:** the server is a DigitalOcean droplet operated by you. A host processing data for you
  is not a "third-party partner" for the label.
- **Retention:** account rows are deleted on account deletion. Game history rows keep the bare
  numeric user id, and connection and request logs keep IPs. The web privacy policy says some game
  records and security logs may be kept. Consider adding a concrete retention period (see
  `privacy-policy-update.md`).

## Privacy policy URL

`https://aegist.dev/privacy` is live (client-rendered, last updated May 11, 2026). It needs a few
additions before review. See [`privacy-policy-update.md`](privacy-policy-update.md).
