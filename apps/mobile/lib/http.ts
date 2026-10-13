/** Headers for the phone's fetch helper. GET must not send Content-Type. */

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

export function buildApiHeaders(options: {
  method?: string;
  token?: string | null;
  auth?: boolean;
  headers?: HeadersInit;
}): Record<string, string> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = headersToRecord(options.headers);
  if (!headers.Accept && !headers.accept) headers.Accept = 'application/json';
  if (!headers['X-Cyprus-Client'] && !headers['x-cyprus-client']) {
    headers['X-Cyprus-Client'] = 'ios';
  }
  // iOS rejects some GETs that advertise a JSON body. Login and other
  // writes still send Content-Type.
  if (method === 'GET' || method === 'HEAD') {
    delete headers['Content-Type'];
    delete headers['content-type'];
  } else if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.auth === false) {
    delete headers.Authorization;
    delete headers.authorization;
  } else if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  return headers;
}
