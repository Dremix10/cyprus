export type FriendStatus = 'none' | 'friends' | 'pending_sent' | 'pending_received';

export type Friend = {
  id: number;
  username: string;
  displayName: string;
  online: boolean;
};

export type FriendRequest = {
  id: number;
  username: string;
  displayName: string;
};
