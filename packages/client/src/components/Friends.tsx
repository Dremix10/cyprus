import { useState, useEffect, useRef } from 'react';
import { useFriendStore } from '../stores/friendStore.js';
import type { FriendStatus } from '@cyprus/shared';

export function FriendsPanel() {
  const friends = useFriendStore((s) => s.friends);
  const requests = useFriendStore((s) => s.requests);
  const fetchFriends = useFriendStore((s) => s.fetchFriends);
  const fetchRequests = useFriendStore((s) => s.fetchRequests);
  const acceptRequest = useFriendStore((s) => s.acceptRequest);
  const rejectRequest = useFriendStore((s) => s.rejectRequest);
  const removeFriend = useFriendStore((s) => s.removeFriend);
  const searchUsers = useFriendStore((s) => s.searchUsers);
  const sendRequest = useFriendStore((s) => s.sendRequest);

  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: number; username: string; displayName: string; friendStatus: FriendStatus }>>([]);
  const [searching, setSearching] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<Record<number, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetchFriends();
    fetchRequests();
    // Poll for online status every 30s
    const interval = setInterval(() => {
      fetchFriends();
      fetchRequests();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchFriends, fetchRequests]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchUsers(q.trim());
      setSearchResults(results);
      setSearching(false);
    }, 300);
  };

  const handleSendRequest = async (userId: number) => {
    const result = await sendRequest(userId);
    if (result.success) {
      setActionFeedback((prev) => ({ ...prev, [userId]: 'Sent!' }));
      // Refresh search results to update status
      if (searchQuery.trim().length >= 2) {
        const results = await searchUsers(searchQuery.trim());
        setSearchResults(results);
      }
    } else {
      setActionFeedback((prev) => ({ ...prev, [userId]: result.error || 'Failed' }));
    }
    setTimeout(() => setActionFeedback((prev) => { const n = { ...prev }; delete n[userId]; return n; }), 2000);
  };

  const handleAccept = async (userId: number) => {
    const ok = await acceptRequest(userId);
    if (ok) { fetchFriends(); fetchRequests(); }
  };

  const handleReject = async (userId: number) => {
    await rejectRequest(userId);
    fetchRequests();
  };

  const handleRemove = async (friendId: number) => {
    const ok = await removeFriend(friendId);
    if (ok) fetchFriends();
  };

  const onlineFriends = friends.filter((f) => f.online);
  const offlineFriends = friends.filter((f) => !f.online);

  return (
    <div className="friends-panel">
      <button
        className="friends-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        Friends {friends.length > 0 && `(${friends.length})`}
        {requests.length > 0 && <span className="friends-badge">{requests.length}</span>}
        <span className={`friends-chevron ${expanded ? 'friends-chevron-up' : ''}`}>&#9662;</span>
      </button>

      {expanded && (
        <div className="friends-content">
          {/* Search */}
          <div className="friends-search">
            <input
              type="text"
              placeholder="Search users to add..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="input input-greek friends-search-input"
            />
          </div>

          {/* Search Results */}
          {searchQuery.trim().length >= 2 && (
            <div className="friends-section">
              {searching ? (
                <p className="friends-empty">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="friends-empty">No users found</p>
              ) : (
                <ul className="friends-list">
                  {searchResults.map((u) => (
                    <li key={u.id} className="friend-item">
                      <span className="friend-name">{u.displayName}</span>
                      {actionFeedback[u.id] ? (
                        <span className="friend-action-feedback">{actionFeedback[u.id]}</span>
                      ) : u.friendStatus === 'friends' ? (
                        <span className="friend-status-label">Friends</span>
                      ) : u.friendStatus === 'pending_sent' ? (
                        <span className="friend-status-label">Pending</span>
                      ) : u.friendStatus === 'pending_received' ? (
                        <button className="btn-friend btn-friend-accept" onClick={() => handleAccept(u.id)}>Accept</button>
                      ) : (
                        <button className="btn-friend btn-friend-add" onClick={() => handleSendRequest(u.id)}>Add</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Pending Requests */}
          {requests.length > 0 && (
            <div className="friends-section">
              <h4 className="friends-section-title">Requests</h4>
              <ul className="friends-list">
                {requests.map((r) => (
                  <li key={r.id} className="friend-item">
                    <span className="friend-name">{r.displayName}</span>
                    <div className="friend-actions">
                      <button className="btn-friend btn-friend-accept" onClick={() => handleAccept(r.id)}>Accept</button>
                      <button className="btn-friend btn-friend-reject" onClick={() => handleReject(r.id)}>Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Friends List */}
          {friends.length === 0 && requests.length === 0 && searchQuery.trim().length < 2 ? (
            <p className="friends-empty">No friends yet. Search for users above!</p>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className="friends-section">
                  <h4 className="friends-section-title">Online</h4>
                  <ul className="friends-list">
                    {onlineFriends.map((f) => (
                      <li key={f.id} className="friend-item">
                        <span className="friend-online-dot" />
                        <span className="friend-name">{f.displayName}</span>
                        <button className="btn-friend btn-friend-remove" onClick={() => handleRemove(f.id)} title="Remove friend">x</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {offlineFriends.length > 0 && (
                <div className="friends-section">
                  <h4 className="friends-section-title">Offline</h4>
                  <ul className="friends-list">
                    {offlineFriends.map((f) => (
                      <li key={f.id} className="friend-item">
                        <span className="friend-offline-dot" />
                        <span className="friend-name friend-name-offline">{f.displayName}</span>
                        <button className="btn-friend btn-friend-remove" onClick={() => handleRemove(f.id)} title="Remove friend">x</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Small "Add Friend" button for use in-game next to player names */
export function AddFriendButton({ userId, displayName }: { userId: number; displayName: string }) {
  const sendRequest = useFriendStore((s) => s.sendRequest);
  const getFriendStatus = useFriendStore((s) => s.getFriendStatus);
  const [status, setStatus] = useState<FriendStatus | 'loading'>('loading');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    getFriendStatus(userId).then(setStatus);
  }, [userId, getFriendStatus]);

  if (status === 'loading' || status === 'friends') return null;

  const handleAdd = async () => {
    const result = await sendRequest(userId);
    if (result.success) {
      setFeedback('Sent!');
      setStatus('pending_sent');
    } else {
      setFeedback(result.error || 'Failed');
    }
    setTimeout(() => setFeedback(null), 2000);
  };

  if (status === 'pending_sent') return <span className="friend-status-label-small">Pending</span>;
  if (status === 'pending_received') return <span className="friend-status-label-small">Pending</span>;

  return feedback ? (
    <span className="friend-status-label-small">{feedback}</span>
  ) : (
    <button className="btn-friend-ingame" onClick={handleAdd} title={`Add ${displayName} as friend`}>+</button>
  );
}
