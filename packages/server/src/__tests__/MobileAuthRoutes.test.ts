import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TrackerDB } from '../Database.js';
import { AuthService } from '../AuthService.js';
import { createAuthRouter } from '../AuthRoutes.js';

describe('mobile and website sessions', () => {
  let db: TrackerDB;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    db = new TrackerDB(':memory:');
    const auth = new AuthService(db);
    await auth.register(
      'mobiletester',
      'password123',
      'Mobile Tester',
      'mobile@example.com',
    );
    const app = express();
    app.use(express.json());
    app.use('/auth', createAuthRouter(auth, false));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test port');
    base = `http://127.0.0.1:${address.port}/auth`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    db.close();
  });

  async function login(mobile: boolean) {
    return fetch(`${base}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(mobile ? { 'X-Cyprus-Client': 'ios' } : {}),
      },
      body: JSON.stringify({
        username: 'mobiletester',
        password: 'password123',
      }),
    });
  }

  it('returns a mobile token, authenticates with Bearer, and invalidates it on logout', async () => {
    const response = await login(true);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toEqual(expect.any(String));
    const headers = { Authorization: `Bearer ${body.token}` };
    const me = await fetch(`${base}/me`, { headers });
    expect((await me.json()).user.username).toBe('mobiletester');
    expect(
      (await fetch(`${base}/logout`, { method: 'POST', headers })).status,
    ).toBe(200);
    expect((await fetch(`${base}/me`, { headers })).status).toBe(401);
  });

  it('keeps website sessions in HttpOnly cookies without exposing a token in the body', async () => {
    const response = await login(false);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(await response.json()).not.toHaveProperty('token');
    const me = await fetch(`${base}/me`, {
      headers: { Cookie: cookie.split(';')[0] },
    });
    expect((await me.json()).user.username).toBe('mobiletester');
  });

  it('does not fall back to a cookie when the supplied bearer token is invalid', async () => {
    const response = await login(false);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect(
      (
        await fetch(`${base}/me`, {
          headers: { Cookie: cookie, Authorization: 'Bearer invalid-token' },
        })
      ).status,
    ).toBe(401);
  });
});
