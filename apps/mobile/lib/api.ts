import { BASE_URL } from './config';
import { getSocketToken } from './token';

/** Calls the same HTTPS routes as the website, with the phone's session token. */
export async function api(path: string, options?: RequestInit): Promise<Response> {
  const token = getSocketToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Cyprus-Client': 'ios',
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${BASE_URL}${path}`, { ...options, headers });
}
