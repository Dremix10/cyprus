/**
 * One tap from the friends list: open a fresh waiting room when the player
 * is not already in one, then send the existing friend-invite.
 */

export type FriendLobbyInvitePlan =
  | { kind: 'create-then-invite' }
  | { kind: 'invite-current-room' }
  | { kind: 'blocked'; error: string };

export function planFriendLobbyInvite(input: {
  inRoom: boolean;
  gameStarted: boolean;
  playerCount: number;
}): FriendLobbyInvitePlan {
  if (!input.inRoom) return { kind: 'create-then-invite' };
  if (input.gameStarted) return { kind: 'blocked', error: 'Game already started' };
  if (input.playerCount >= 4) return { kind: 'blocked', error: 'Room is full' };
  return { kind: 'invite-current-room' };
}

export type InviteStepResult = { ok: true } | { ok: false; error?: string };

export async function runFriendLobbyInvite(
  plan: FriendLobbyInvitePlan,
  steps: {
    createRoom: () => Promise<InviteStepResult>;
    sendInvite: () => Promise<InviteStepResult>;
  },
): Promise<{ success: boolean; createdRoom: boolean; error?: string }> {
  if (plan.kind === 'blocked') {
    return { success: false, createdRoom: false, error: plan.error };
  }

  let createdRoom = false;
  if (plan.kind === 'create-then-invite') {
    const created = await steps.createRoom();
    if (!created.ok) {
      return { success: false, createdRoom: false, error: created.error ?? 'Could not create room' };
    }
    createdRoom = true;
  }

  const sent = await steps.sendInvite();
  if (!sent.ok) {
    return { success: false, createdRoom, error: sent.error ?? 'Could not send invite' };
  }
  return { success: true, createdRoom };
}
