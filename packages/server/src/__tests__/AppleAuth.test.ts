import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'apple-test',
  alg: 'RS256',
  use: 'sig',
};
const claims = {
  iss: 'https://appleid.apple.com',
  aud: 'dev.aegist.titsu',
  sub: 'apple-user',
  exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'player@example.com',
  email_verified: 'true',
};

function token(payload = claims, header = { alg: 'RS256', kid: jwk.kid }) {
  const data = [header, payload]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}

describe('Apple identity verification', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts a signed RS256 identity and verified email', async () => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    expect(await verifyAppleIdentityToken(token(), claims.aud)).toEqual({
      sub: claims.sub,
      email: claims.email,
    });
  });

  it.each([
    ['audience', { ...claims, aud: 'another-app' }],
    ['issuer', { ...claims, iss: 'https://attacker.example' }],
    ['expiry', { ...claims, exp: 0 }],
  ])('rejects an invalid %s', async (_name, payload) => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    await expect(
      verifyAppleIdentityToken(token(payload), claims.aud),
    ).rejects.toThrow();
  });

  it('rejects the wrong algorithm', async () => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    await expect(
      verifyAppleIdentityToken(
        token(claims, { alg: 'ES256', kid: jwk.kid }),
        claims.aud,
      ),
    ).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    const parts = token().split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ ...claims, sub: 'another-user' }),
    ).toString('base64url');
    await expect(
      verifyAppleIdentityToken(parts.join('.'), claims.aud),
    ).rejects.toThrow('signature');
  });

  it('does not use an unverified email for account linking', async () => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    expect(
      await verifyAppleIdentityToken(
        token({ ...claims, email_verified: 'false' }),
        claims.aud,
      ),
    ).toEqual({ sub: claims.sub, email: undefined });
  });

  it('refreshes cached keys when Apple rotates the key id', async () => {
    const { verifyAppleIdentityToken } = await import('../AppleAuth.js');
    await verifyAppleIdentityToken(token(), claims.aud);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keys: [{ ...jwk, kid: 'rotated-key' }] }),
    } as Response);
    await expect(
      verifyAppleIdentityToken(
        token(claims, { alg: 'RS256', kid: 'rotated-key' }),
        claims.aud,
      ),
    ).resolves.toHaveProperty('sub', claims.sub);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
