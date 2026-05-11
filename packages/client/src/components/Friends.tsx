import { useState, useEffect, useRef } from 'react';
import { useFriendStore } from '../stores/friendStore.js';
import type { FriendStatus } from '@cyprus/shared';
import { useT } from '../i18n.js';

type SearchResult = {
  id: number;
  username: string;
  displayName: string;
  friendStatus: FriendStatus;
};

type FriendLike = {
  id: number;
  username: string;
  displayName: string;
  online?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function FriendAvatar({ person, online, small = false }: { person: FriendLike; online?: boolean; small?: boolean }) {
  return (
    <span className={`friend-avatar ${small ? 'friend-avatar-small' : ''} ${online ? 'is-online' : ''}`}>
      {getInitials(person.displayName || person.username)}
    </span>
  );
}

function FriendIdentity({ person }: { person: FriendLike }) {
  return (
    <span className="friend-copy">
      <span className="friend-name">{person.displayName}</span>
      <span className="friend-username">@{person.username}</span>
    </span>
  );
}

function AddFriendModal({
  query,
  results,
  searching,
  feedback,
  onSearch,
  onClose,
  onSend,
  onAccept,
}: {
  query: string;
  results: SearchResult[];
  searching: boolean;
  feedback: Record<number, string>;
  onSearch: (query: string) => void;
  onClose: () => void;
  onSend: (id: number) => void;
  onAccept: (requestId: number) => void;
}) {
  const t = useT();
  const trimmedQuery = query.trim();

  return (
    <div className="friends-add-overlay" role="presentation" onClick={onClose}>
      <div className="friends-add-sheet" role="dialog" aria-modal="true" aria-label={t('friends.addFriendTitle')} onClick={(event) => event.stopPropagation()}>
        <div className="friends-add-header">
          <div>
            <h3>{t('friends.addFriendTitle')}</h3>
            <p>{t('friends.addFriendHint')}</p>
          </div>
          <button type="button" className="friends-icon-button" onClick={onClose} aria-label={t('friends.close')}>
            x
          </button>
        </div>

        <input
          className="friends-search-input"
          type="text"
          placeholder={t('friends.searchPlaceholder')}
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          autoFocus
        />

        <div className="friends-search-results">
          {trimmedQuery.length < 2 && <p className="friends-search-hint">{t('friends.searchHint')}</p>}
          {searching && <div className="friends-searching">{t('friends.searching')}</div>}
          {!searching && trimmedQuery.length >= 2 && results.length === 0 && <div className="friends-empty">{t('friends.noUsersFound')}</div>}
          {!searching && results.map((user) => (
            <div key={user.id} className="friend-search-result">
              <FriendAvatar person={user} online={false} />
              <FriendIdentity person={user} />
              {feedback[user.id] ? (
                <span className="friend-status-label">{feedback[user.id]}</span>
              ) : user.friendStatus === 'friends' ? (
                <span className="friend-status-label">{t('friends.friends')}</span>
              ) : user.friendStatus === 'pending_sent' ? (
                <span className="friend-status-label">{t('friends.pending')}</span>
              ) : user.friendStatus === 'pending_received' ? (
                <button type="button" className="btn-friend btn-friend-accept" onClick={() => onAccept(user.id)}>
                  {t('friends.accept')}
                </button>
              ) : (
                <button type="button" className="btn-friend btn-friend-add" onClick={() => onSend(user.id)}>
                  {t('friends.add')}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FriendsPanel() {
  const t = useT();
  const { friends, requests, fetchFriends, fetchRequests, searchUsers, sendRequest, acceptRequest, rejectRequest, removeFriend } = useFriendStore();
  const [expanded, setExpanded] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<Record<number, string>>({});
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchFriends();
    fetchRequests();
    const interval = setInterval(() => {
      fetchFriends();
      fetchRequests();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchFriends, fetchRequests]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const onlineFriends = friends.filter((friend) => friend.online);
  const offlineFriends = friends.filter((friend) => !friend.online);
  const visiblePreviewFriends = onlineFriends.slice(0, 3);
  const summaryParts = [
    onlineFriends.length === 1 ? t('friends.oneOnline') : t('friends.onlineCount', { count: onlineFriends.length }),
    requests.length === 1 ? t('friends.oneRequest') : t('friends.requestCount', { count: requests.length }),
  ];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setActionFeedback({});

    if (searchTimer.current) clearTimeout(searchTimer.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchUsers(trimmed);
      setSearchResults(results);
      setSearching(false);
    }, 300);
  };

  const closeAddFriend = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setShowAddFriend(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setActionFeedback({});
  };

  const handleSendRequest = async (userId: number) => {
    const result = await sendRequest(userId);
    setActionFeedback((prev) => ({
      ...prev,
      [userId]: result.success ? t('friends.sent') : result.error || t('friends.failed'),
    }));
    if (result.success) {
      setSearchResults((prev) => prev.map((user) => user.id === userId ? { ...user, friendStatus: 'pending_sent' as FriendStatus } : user));
    }
  };

  const handleAcceptRequest = async (requestId: number) => {
    await acceptRequest(requestId);
    await fetchFriends();
    await fetchRequests();
  };

  const handleRemoveFriend = async (friendId: number) => {
    await removeFriend(friendId);
    setConfirmRemoveId(null);
  };

  return (
    <div className="friends-panel">
      <button type="button" className={`friends-toggle ${requests.length > 0 ? 'has-requests' : ''}`} onClick={() => setExpanded(!expanded)}>
        <span className="friends-toggle-main">
          <span className="friends-title-row">
            <span className="friends-toggle-title">{t('friends.title')}</span>
            {requests.length > 0 && <span className="friends-request-badge">{requests.length}</span>}
          </span>
          <span className="friends-meta">{summaryParts.join(' · ')}</span>
        </span>

        {visiblePreviewFriends.length > 0 && (
          <span className="friends-avatar-stack" aria-hidden="true">
            {visiblePreviewFriends.map((friend) => <FriendAvatar key={friend.id} person={friend} online small />)}
          </span>
        )}

        <span className="friends-chevron">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="friends-content">
          <div className="friends-panel-actions">
            <button type="button" className="btn-friend btn-friend-add friends-add-button" onClick={() => setShowAddFriend(true)}>
              {t('friends.addFriend')}
            </button>
          </div>

          {requests.length > 0 && (
            <div className="friends-section">
              <div className="friends-section-header">
                <span>{t('friends.requests')}</span>
                <span>{requests.length}</span>
              </div>
              <div className="friends-list">
                {requests.map((request) => (
                  <div key={request.id} className="friend-item friend-item-request">
                    <FriendAvatar person={request} online={false} />
                    <FriendIdentity person={request} />
                    <div className="friend-actions">
                      <button type="button" className="btn-friend btn-friend-accept" onClick={() => handleAcceptRequest(request.id)}>
                        {t('friends.accept')}
                      </button>
                      <button type="button" className="btn-friend btn-friend-reject" onClick={() => rejectRequest(request.id)}>
                        {t('friends.reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friends.length === 0 ? (
            <div className="friends-empty-state">
              <strong>{t('friends.emptyTitle')}</strong>
              <span>{t('friends.emptyCopy')}</span>
            </div>
          ) : (
            <>
              {onlineFriends.length > 0 && (
                <div className="friends-section">
                  <div className="friends-section-header">
                    <span>{t('friends.online')}</span>
                    <span>{onlineFriends.length}</span>
                  </div>
                  <div className="friends-list">
                    {onlineFriends.map((friend) => (
                      <div key={friend.id} className="friend-item">
                        <FriendAvatar person={friend} online />
                        <FriendIdentity person={friend} />
                        {confirmRemoveId === friend.id ? (
                          <div className="friend-remove-confirm">
                            <span>{t('friends.removeConfirm')}</span>
                            <button type="button" className="btn-friend btn-friend-reject" onClick={() => handleRemoveFriend(friend.id)}>
                              {t('friends.remove')}
                            </button>
                            <button type="button" className="btn-friend btn-friend-ghost" onClick={() => setConfirmRemoveId(null)}>
                              {t('friends.keep')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-friend-remove"
                            title={t('friends.removeFriend')}
                            onClick={() => setConfirmRemoveId(friend.id)}
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {offlineFriends.length > 0 && (
                <div className="friends-section">
                  <div className="friends-section-header">
                    <span>{t('friends.offline')}</span>
                    <span>{offlineFriends.length}</span>
                  </div>
                  <div className="friends-list">
                    {offlineFriends.map((friend) => (
                      <div key={friend.id} className="friend-item friend-item-offline">
                        <FriendAvatar person={friend} online={false} />
                        <FriendIdentity person={friend} />
                        {confirmRemoveId === friend.id ? (
                          <div className="friend-remove-confirm">
                            <span>{t('friends.removeConfirm')}</span>
                            <button type="button" className="btn-friend btn-friend-reject" onClick={() => handleRemoveFriend(friend.id)}>
                              {t('friends.remove')}
                            </button>
                            <button type="button" className="btn-friend btn-friend-ghost" onClick={() => setConfirmRemoveId(null)}>
                              {t('friends.keep')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-friend-remove"
                            title={t('friends.removeFriend')}
                            onClick={() => setConfirmRemoveId(friend.id)}
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showAddFriend && (
        <AddFriendModal
          query={searchQuery}
          results={searchResults}
          searching={searching}
          feedback={actionFeedback}
          onSearch={handleSearch}
          onClose={closeAddFriend}
          onSend={handleSendRequest}
          onAccept={handleAcceptRequest}
        />
      )}
    </div>
  );
}

export function AddFriendButton({ userId, displayName }: { userId: number; displayName: string }) {
  const t = useT();
  const { sendRequest, getFriendStatus } = useFriendStore();
  const [status, setStatus] = useState<FriendStatus | 'loading'>('loading');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    getFriendStatus(userId).then(setStatus);
  }, [userId, getFriendStatus]);

  const handleClick = async () => {
    const result = await sendRequest(userId);
    if (result.success) {
      setStatus('pending_sent');
      setFeedback(t('friends.sent'));
    } else {
      setFeedback(result.error || t('friends.failed'));
    }
    setTimeout(() => setFeedback(null), 2000);
  };

  if (status === 'loading' || status === 'friends') return null;
  if (status === 'pending_sent' || status === 'pending_received') return <span className="friend-status-label-small">{t('friends.pending')}</span>;
  if (feedback) return <span className="friend-status-label-small">{feedback}</span>;

  return (
    <button
      type="button"
      className="add-friend-btn-small"
      onClick={handleClick}
      title={t('friends.addPlayerAsFriend', { name: displayName })}
    >
      +
    </button>
  );
}
