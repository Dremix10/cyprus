import { useEffect, useState } from 'react';
import { useFriendStore } from '../stores/friendStore.js';
import { useAuthStore } from '../stores/authStore.js';
import { useT } from '../i18n.js';

export function InviteFriendPicker({ onClose }: { onClose: () => void }) {
  const t = useT();
  const friends = useFriendStore((s) => s.friends);
  const fetchFriends = useFriendStore((s) => s.fetchFriends);
  const sendInvite = useFriendStore((s) => s.sendInvite);
  const [statusById, setStatusById] = useState<Record<number, { kind: 'sent' | 'error'; msg?: string }>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const online = friends.filter((f) => f.online);

  const onInvite = async (friendId: number) => {
    setBusyId(friendId);
    const res = await sendInvite(friendId);
    setBusyId(null);
    setStatusById((prev) => ({
      ...prev,
      [friendId]: res.success ? { kind: 'sent' } : { kind: 'error', msg: res.error },
    }));
  };

  return (
    <div className="invite-picker-overlay" onClick={onClose}>
      <div className="invite-picker" onClick={(e) => e.stopPropagation()}>
        <div className="invite-picker-header">
          <h3>{t('friends.inviteFriend')}</h3>
          <button className="btn btn-small" onClick={onClose}>{t('friends.close')}</button>
        </div>
        {online.length === 0 ? (
          <p className="invite-picker-empty">{t('friends.noOnlineFriends')}</p>
        ) : (
          <ul className="invite-picker-list">
            {online.map((f) => {
              const status = statusById[f.id];
              return (
                <li key={f.id} className="invite-picker-row">
                  <span className="friend-dot online" />
                  <span className="friend-name">{f.displayName}</span>
                  {status?.kind === 'sent' ? (
                    <span className="invite-sent">{t('friends.invited')}</span>
                  ) : (
                    <button
                      className="btn btn-small"
                      onClick={() => onInvite(f.id)}
                      disabled={busyId === f.id}
                    >
                      {busyId === f.id ? t('friends.sending') : t('friends.invite')}
                    </button>
                  )}
                  {status?.kind === 'error' && (
                    <span className="invite-error">{status.msg}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function InviteFriendButton() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  if (!user) return null; // invites are authenticated-only
  return (
    <>
      <button className="btn btn-small" onClick={() => setOpen(true)}>
        {t('friends.inviteFriend')}
      </button>
      {open && <InviteFriendPicker onClose={() => setOpen(false)} />}
    </>
  );
}
