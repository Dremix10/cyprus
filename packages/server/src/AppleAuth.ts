import { createPublicKey, verify as cryptoVerify } from 'crypto';

/**
 * Checks a Sign in with Apple identity token.
 * Apple signs identity tokens with RS256. Keys are Apple's public set,
 * cached an hour and refreshed when a new key id appears.
 */

type AppleJwk = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
};

let cached: { keys: AppleJwk[]; at: number } | null = null;

export async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string,
): Promise<{ sub: string; email?: string }> {
  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | string;
  };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid)
    throw new Error('Unexpected Apple token');
  if (payload.iss !== 'https://appleid.apple.com')
    throw new Error('Invalid Apple issuer');
  if (payload.aud !== audience) throw new Error('Invalid Apple audience');
  if (
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.exp * 1000 <= Date.now()
  )
    throw new Error('Apple token expired');
  if (typeof payload.sub !== 'string' || !payload.sub)
    throw new Error('Invalid Apple token');

  if (
    !cached ||
    Date.now() - cached.at > 60 * 60_000 ||
    !cached.keys.some((k) => k.kid === header.kid)
  ) {
    const res = await fetch('https://appleid.apple.com/auth/keys', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error('Could not load Apple keys');
    const body = (await res.json()) as { keys: AppleJwk[] };
    cached = { keys: body.keys, at: Date.now() };
  }
  const jwk = cached.keys.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig')
    throw new Error('Unknown Apple key');

  const key = createPublicKey({
    key: jwk as unknown as JsonWebKey,
    format: 'jwk',
  });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], 'base64url');
  const ok = cryptoVerify('RSA-SHA256', data, key, sig);
  if (!ok) throw new Error('Apple token signature failed');
  const emailVerified =
    payload.email_verified === true || payload.email_verified === 'true';
  return {
    sub: payload.sub,
    email:
      emailVerified && typeof payload.email === 'string'
        ? payload.email
        : undefined,
  };
}
