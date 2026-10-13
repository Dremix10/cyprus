import { describe, it, expect, vi } from 'vitest';
import { planFriendLobbyInvite, runFriendLobbyInvite } from '../friendInvite.js';

describe('planFriendLobbyInvite', () => {
  it('creates a room when the player is still in the lobby', () => {
    expect(planFriendLobbyInvite({ inRoom: false, gameStarted: false, playerCount: 0 })).toEqual({
      kind: 'create-then-invite',
    });
  });

  it('invites into the room the player is already waiting in', () => {
    expect(planFriendLobbyInvite({ inRoom: true, gameStarted: false, playerCount: 2 })).toEqual({
      kind: 'invite-current-room',
    });
  });

  it('refuses once the game has started or the room is full', () => {
    expect(planFriendLobbyInvite({ inRoom: true, gameStarted: true, playerCount: 4 }).kind).toBe('blocked');
    expect(planFriendLobbyInvite({ inRoom: true, gameStarted: false, playerCount: 4 })).toEqual({
      kind: 'blocked',
      error: 'Room is full',
    });
  });
});

describe('runFriendLobbyInvite', () => {
  it('creates the room, then sends the existing invite', async () => {
    const order: string[] = [];
    const result = await runFriendLobbyInvite(
      { kind: 'create-then-invite' },
      {
        createRoom: async () => {
          order.push('create');
          return { ok: true };
        },
        sendInvite: async () => {
          order.push('invite');
          return { ok: true };
        },
      },
    );
    expect(order).toEqual(['create', 'invite']);
    expect(result).toEqual({ success: true, createdRoom: true });
  });

  it('does not send an invite when the new room cannot be created', async () => {
    const sendInvite = vi.fn(async () => ({ ok: true as const }));
    const result = await runFriendLobbyInvite(
      { kind: 'create-then-invite' },
      {
        createRoom: async () => ({ ok: false, error: 'Enter a nickname' }),
        sendInvite,
      },
    );
    expect(sendInvite).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, createdRoom: false, error: 'Enter a nickname' });
  });

  it('sends the invite without opening a second room', async () => {
    const createRoom = vi.fn(async () => ({ ok: true as const }));
    const result = await runFriendLobbyInvite(
      { kind: 'invite-current-room' },
      {
        createRoom,
        sendInvite: async () => ({ ok: true }),
      },
    );
    expect(createRoom).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, createdRoom: false });
  });

  it('keeps the new room when the invite itself fails', async () => {
    const result = await runFriendLobbyInvite(
      { kind: 'create-then-invite' },
      {
        createRoom: async () => ({ ok: true }),
        sendInvite: async () => ({ ok: false, error: 'Friend is offline' }),
      },
    );
    expect(result).toEqual({ success: false, createdRoom: true, error: 'Friend is offline' });
  });

  it('does not create or invite when the plan is blocked', async () => {
    const createRoom = vi.fn();
    const sendInvite = vi.fn();
    const result = await runFriendLobbyInvite(
      { kind: 'blocked', error: 'Game already started' },
      { createRoom, sendInvite },
    );
    expect(createRoom).not.toHaveBeenCalled();
    expect(sendInvite).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Game already started');
  });
});
