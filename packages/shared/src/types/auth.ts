export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  createdAt: string;
  gamesPlayed: number;
  gamesWon: number;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
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
  field?: 'username' | 'password' | 'displayName';
}
