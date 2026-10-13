import { BASE_URL } from './config';
import { buildApiHeaders } from './http';
import { getSocketToken } from './token';

export type ApiOptions = RequestInit & { auth?: boolean };

/** Calls the same HTTPS routes as the website, with the phone's session token. */
export async function api(path: string, options?: ApiOptions): Promise<Response> {
  const { auth, headers, ...rest } = options ?? {};
  return fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: buildApiHeaders({
      method: rest.method,
      token: getSocketToken(),
      auth,
      headers,
    }),
  });
}
