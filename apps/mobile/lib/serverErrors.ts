/**
 * The server only answers in English. These are the errors a player realistically sees
 * (sign-in, rooms, rate limits, illegal plays), mapped to i18n keys so the Greek UI can show
 * them in Greek. Each key's English text is the server's exact message, so English is unchanged.
 * Anything not listed passes through as the server sent it.
 *
 * No React Native imports here, so `npm test` can load it in plain Node.
 */

export const SERVER_ERRORS: Record<string, string> = {
  // Sign-in, register, profile, delete account (AuthService / AuthRoutes)
  'Invalid credentials': 'serverError.invalidCredentials',
  'Password is incorrect': 'serverError.passwordIncorrect',
  'Current password is incorrect': 'serverError.currentPasswordIncorrect',
  'Username is already taken': 'serverError.usernameTaken',
  'An account with this email already exists': 'serverError.emailTaken',
  'Username is required': 'serverError.usernameRequired',
  'Username must be at least 3 characters': 'serverError.usernameTooShort',
  'Username must be at most 20 characters': 'serverError.usernameTooLong',
  'Username can only contain letters, numbers, and underscores': 'serverError.usernameChars',
  'Password is required': 'serverError.passwordRequired',
  'Password must be at least 8 characters': 'serverError.passwordTooShort',
  'Display name is required': 'serverError.displayNameRequired',
  'Display name must be at most 20 characters': 'serverError.displayNameTooLong',
  'Display name contains invalid characters': 'serverError.displayNameChars',
  'Email is required': 'serverError.emailRequired',
  'Invalid email address': 'serverError.emailInvalid',
  'This account uses Google Sign-In. Please sign in with Google': 'serverError.useGoogle',
  'Too many requests. Try again later': 'serverError.tooManyRequests',
  'Too many failed attempts. Account locked for 15 minutes': 'serverError.lockedOut',
  'Could not delete the account. Please try again.': 'serverError.deleteFailed',
  'Session expired': 'error.sessionExpired',
  'Session invalid': 'error.sessionInvalid',

  // Rooms (RoomManager / SocketHandler)
  'Room not found': 'serverError.roomNotFound',
  'Room is full': 'serverError.roomFull',
  'Room no longer exists': 'error.roomGone',
  'Room no longer available': 'serverError.roomUnavailable',
  'Game already started': 'serverError.gameStarted',
  'Need at least 2 players': 'serverError.needTwoPlayers',
  'Nickname already taken': 'serverError.nicknameTaken',
  'Nickname must be 1-20 characters': 'serverError.nicknameLength',
  'Nickname contains invalid characters': 'serverError.nicknameChars',
  'Your nickname may be offensive to other players': 'serverError.nicknameOffensive',
  'Enter a room code': 'error.enterRoomCode',
  'Server is updating — please try again in a minute': 'serverError.serverUpdating',

  // Rate limits (SocketHandler)
  'Too many requests, slow down': 'serverError.slowDown',
  'Too many connections, please wait a moment': 'serverError.tooManyConnections',
  'Too many reconnect attempts, try again shortly': 'serverError.tooManyReconnects',

  // Friends and invites (SocketHandler)
  'Already in your room': 'serverError.alreadyInRoom',
  'Friend is offline': 'serverError.friendOffline',
  'Invite already pending': 'serverError.invitePending',
  'Leave your current room first': 'serverError.leaveRoomFirst',
  'Sign in to invite friends': 'serverError.signInToInvite',

  // Illegal plays (GameEngine, sent as game:error)
  'Not your turn': 'serverError.notYourTurn',
  'Cards do not form a valid combination': 'serverError.invalidCombination',
  'Combination does not beat current trick': 'serverError.doesNotBeat',
  'You must play a combination containing the wished rank': 'serverError.mustPlayWish',
  'Cannot pass when leading': 'serverError.cannotPassLeading',
  'Dog can only be led': 'serverError.dogLeadOnly',
};

/** Messages with a number in them. Singular and plural are separate keys. */
const PATTERNS: Array<{ re: RegExp; key: string; param?: string }> = [
  { re: /^Account locked\. Try again in 1 minute$/, key: 'serverError.lockedOneMinute' },
  { re: /^Account locked\. Try again in (\d+) minutes$/, key: 'serverError.lockedMinutes', param: 'n' },
  { re: /^You can change your display name again in 1 day$/, key: 'serverError.renameOneDay' },
  { re: /^You can change your display name again in (\d+) days$/, key: 'serverError.renameDays', param: 'n' },
];

/** The i18n key (and parameters) for a server message, or null when it isn't mapped. */
export function serverErrorKey(message: string): { key: string; params?: Record<string, string> } | null {
  const key = SERVER_ERRORS[message];
  if (key) return { key };
  for (const p of PATTERNS) {
    const m = p.re.exec(message);
    if (m) return p.param ? { key: p.key, params: { [p.param]: m[1] } } : { key: p.key };
  }
  return null;
}

/** Example messages for the patterns, used by the tests to check every key has EN and EL text. */
export const PATTERN_EXAMPLES: Record<string, string> = {
  'serverError.lockedOneMinute': 'Account locked. Try again in 1 minute',
  'serverError.lockedMinutes': 'Account locked. Try again in 12 minutes',
  'serverError.renameOneDay': 'You can change your display name again in 1 day',
  'serverError.renameDays': 'You can change your display name again in 9 days',
};
