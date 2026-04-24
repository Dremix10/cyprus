import { useState } from 'react';
import { useFriendStore } from '../stores/friendStore.js';
import { useRoomStore } from '../stores/roomStore.js';
import { useAuthStore } from '../stores/authStore.js';

export function FriendInvitePopup() {
  const invite = useFriendStore((s) => s.incomingInvite);
  const accept = useFriendStore((s) => s.acceptInvite);
  const decline = useFriendStore((s) => s.declineInvite);
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!invite) return null;

  const onAccept = async () => {
    setBusy(true);
    setError(null);
    const res = await accept();
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Could not join');
      return;
    }
    // Land in the room. Reuse the same flow normal join uses.
    const { setNickname } = useRoomStore.getState();
    const nickname = user?.displayName ?? user?.username ?? '';
    if (nickname) setNickname(nickname);
    useRoomStore.setState({
      roomCode: res.roomCode ?? null,
      view: 'waiting',
      error: null,
    });
  };

  const onDecline = async () => {
    setBusy(true);
    await decline();
    setBusy(false);
  };

  return (
    <div className="friend-invite-popup">
      <div className="friend-invite-card">
        <p className="friend-invite-title">
          <strong>{invite.inviterName}</strong> invited you to a game
        </p>
        <p className="friend-invite-room">Room <code>{invite.roomCode}</code></p>
        {error && <p className="friend-invite-error">{error}</p>}
        <div className="friend-invite-actions">
          <button className="btn btn-primary" onClick={onAccept} disabled={busy}>
            Accept
          </button>
          <button className="btn btn-small" onClick={onDecline} disabled={busy}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
