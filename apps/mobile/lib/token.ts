/** Session token the iPhone keeps itself. The website keeps the same secret in an HttpOnly cookie. */
let current: string | null = null;

export function getSocketToken(): string | null {
  return current;
}

export function setSocketToken(token: string | null): void {
  current = token;
}
