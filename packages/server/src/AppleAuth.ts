import { createPublicKey, verify as cryptoVerify } from 'crypto';

/**
 * Checks a Sign in with Apple identity token.
 * The signature is the raw P-256 pair Apple puts in a JWT, converted to the
 * DER form Node's verifier expects. Keys are Apple's public set, cached an hour.
 */

type AppleJwk = { kty: string; kid: string; use?: string; alg?: string; n?: string; e?: string; crv?: string; x?: string; y?: string };

let cached: { keys: AppleJwk[]; at: number } | null = null;

function rsToDer(sig: Buffer): Buffer {
  const trim = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.subarray(i);
    return v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : v;
  };
  const r = trim(sig.subarray(0, 32));
  const s = trim(sig.subarray(32));
  const body = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string,
): Promise<{ sub: string; email?: string }> {
  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string };
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
  };
  if (header.alg !== 'ES256' || !header.kid) throw new Error('Unexpected Apple token');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid Apple issuer');
  if (payload.aud !== audience) throw new Error('Invalid Apple audience');
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('Apple token expired');
  if (!payload.sub) throw new Error('Invalid Apple token');

  if (!cached || Date.now() - cached.at > 60 * 60_000) {
    const res = await fetch('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new Error('Could not load Apple keys');
    const body = (await res.json()) as { keys: AppleJwk[] };
    cached = { keys: body.keys, at: Date.now() };
  }
  const jwk = cached.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown Apple key');

  const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], 'base64url');
  const ok = cryptoVerify('sha256', data, key, rsToDer(sig));
  if (!ok) throw new Error('Apple token signature failed');
  return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined };
}
