export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
  gamesPlayed: number;
  gamesWon: number;
  avatar: string | null;
  displayNameChangedAt: string | null;
  friendCount: number;
  language: string | null;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
  email: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthError {
  error: string;
  field?: 'username' | 'password' | 'displayName' | 'email';
}
