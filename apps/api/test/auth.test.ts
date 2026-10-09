import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, makeApp, refreshCookie, resetDb, signIn } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

describe('email OTP', () => {
  it('signs in a new user with the emailed code', async () => {
    const h = makeApp();
    await h.req.post('/api/v1/auth/otp/request').send({ email: ' Asha@Example.com ' }).expect(204);
    expect(h.outbox).toHaveLength(1);
    expect(h.outbox[0]?.to).toBe('asha@example.com');
    expect(h.outbox[0]?.subject).toMatch(/^\d{6} is your Tailor sign-in code$/);

    const res = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'asha@example.com', code: h.lastCode('asha@example.com') })
      .expect(200);
    expect(res.body).toMatchObject({ accessToken: expect.any(String), expiresIn: 900 });
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(
      /tailor_rt=.+; Path=\/api\/v1\/auth; Expires=.+; HttpOnly; SameSite=Lax/,
    );

    const me = await h.req
      .get('/api/v1/me')
      .set('authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({
      email: 'asha@example.com',
      role: 'USER',
      regionDefault: 'IN',
      modelImprovementOptIn: false,
      consentAt: null,
    });
  });

  it('rejects a wrong code and locks after max attempts', async () => {
    const h = makeApp({ env: { OTP_MAX_ATTEMPTS: '3' } });
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'a@example.com' }).expect(204);
    const good = h.lastCode('a@example.com')!;
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) {
      const r = await h.req
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'a@example.com', code: wrong })
        .expect(400);
      expect(r.body.error.code).toBe('OTP_INVALID');
    }
    const locked = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'a@example.com', code: good })
      .expect(429);
    expect(locked.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('invalidates the previous code when a new one is requested, and codes are single-use', async () => {
    const h = makeApp({ env: { AUTH_RATE_LIMIT_PER_MIN: '50' } });
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'b@example.com' });
    const first = h.lastCode('b@example.com')!;
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'b@example.com' });
    const second = h.lastCode('b@example.com')!;
    if (first !== second) {
      const r = await h.req
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'b@example.com', code: first })
        .expect(400);
      expect(r.body.error.code).toBe('OTP_INVALID');
    }
    await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'b@example.com', code: second })
      .expect(200);
    const reuse = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'b@example.com', code: second })
      .expect(400);
    expect(reuse.body.error.code).toBe('OTP_EXPIRED');
  });

  it('rejects expired codes', async () => {
    const h = makeApp();
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'c@example.com' });
    await db().otpCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'c@example.com', code: h.lastCode('c@example.com') })
      .expect(400);
    expect(r.body.error.code).toBe('OTP_EXPIRED');
  });

  it('validates input with friendly messages', async () => {
    const h = makeApp();
    const r1 = await h.req
      .post('/api/v1/auth/otp/request')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(r1.body.error.code).toBe('VALIDATION');
    const r2 = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'a@example.com', code: '12' })
      .expect(400);
    expect(r2.body.error.message).toBe('Enter the 6-digit code');
    const r3 = await h.req
      .post('/api/v1/auth/otp/request')
      .set('content-type', 'application/json')
      .send('{bad')
      .expect(400);
    expect(r3.body.error.code).toBe('BAD_REQUEST');
  });

  it('rate-limits auth per IP and OTP requests per email', async () => {
    const h = makeApp({
      env: { AUTH_RATE_LIMIT_PER_MIN: '5', OTP_REQUESTS_PER_EMAIL_PER_HOUR: '2' },
    });
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'd@example.com' }).expect(204);
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'd@example.com' }).expect(204);
    const perEmail = await h.req
      .post('/api/v1/auth/otp/request')
      .send({ email: 'd@example.com' })
      .expect(429);
    expect(perEmail.body.error.code).toBe('RATE_LIMITED');
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'e@example.com' }).expect(204);
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'f@example.com' }).expect(204);
    const perIp = await h.req
      .post('/api/v1/auth/otp/request')
      .send({ email: 'g@example.com' })
      .expect(429);
    expect(perIp.headers['retry-after']).toBe('60');
  });

  it('blocks deleted accounts', async () => {
    const h = makeApp();
    await db().user.create({ data: { email: 'gone@example.com', deletedAt: new Date() } });
    await h.req.post('/api/v1/auth/otp/request').send({ email: 'gone@example.com' });
    const r = await h.req
      .post('/api/v1/auth/otp/verify')
      .send({ email: 'gone@example.com', code: h.lastCode('gone@example.com') })
      .expect(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });
});

describe('refresh tokens', () => {
  it('rotates on refresh and revokes the family on reuse', async () => {
    const h = makeApp();
    const { cookie } = await signIn(h);

    const r1 = await h.req.post('/api/v1/auth/refresh').set('cookie', cookie).expect(200);
    const rotated = refreshCookie(r1)!;
    expect(rotated).not.toBe(cookie);
    expect(r1.body.accessToken).toEqual(expect.any(String));

    // Replaying the old token is treated as theft: the whole family dies.
    await h.req.post('/api/v1/auth/refresh').set('cookie', cookie).expect(401);
    await h.req.post('/api/v1/auth/refresh').set('cookie', rotated).expect(401);
    const rows = await db().refreshToken.findMany();
    expect(rows.every((t) => t.revokedAt !== null)).toBe(true);
    expect(rows.find((t) => t.replacedById !== null)).toBeTruthy();
  });

  it('rejects missing, unknown and expired refresh tokens', async () => {
    const h = makeApp();
    await h.req.post('/api/v1/auth/refresh').expect(401);
    await h.req.post('/api/v1/auth/refresh').set('cookie', 'tailor_rt=nope').expect(401);
    const { cookie } = await signIn(h);
    await db().refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await h.req.post('/api/v1/auth/refresh').set('cookie', cookie).expect(401);
    expect((r.headers['set-cookie'] as unknown as string[])[0]).toMatch(/tailor_rt=;/);
  });

  it('logout revokes the session', async () => {
    const h = makeApp();
    const { cookie } = await signIn(h);
    await h.req.post('/api/v1/auth/logout').set('cookie', cookie).expect(204);
    await h.req.post('/api/v1/auth/refresh').set('cookie', cookie).expect(401);
    await h.req.post('/api/v1/auth/logout').expect(204);
  });
});

describe('/me', () => {
  it('requires a valid bearer token', async () => {
    const h = makeApp();
    await h.req.get('/api/v1/me').expect(401);
    const bad = await h.req.get('/api/v1/me').set('authorization', 'Bearer garbage').expect(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');
  });

  it('updates onboarding and consent fields', async () => {
    const h = makeApp();
    const { accessToken } = await signIn(h);
    const auth = { authorization: `Bearer ${accessToken}` };
    const r = await h.req
      .patch('/api/v1/me')
      .set(auth)
      .send({
        name: 'Asha Rao',
        regionDefault: 'US',
        targetRoles: ['Data Analyst'],
        experienceLevel: 'mid',
        consent: true,
        onboarded: true,
      })
      .expect(200);
    expect(r.body).toMatchObject({
      name: 'Asha Rao',
      regionDefault: 'US',
      targetRoles: ['Data Analyst'],
      experienceLevel: 'mid',
      modelImprovementOptIn: false,
    });
    expect(r.body.consentAt).toEqual(expect.any(String));
    expect(r.body.onboardedAt).toEqual(expect.any(String));
    const bad = await h.req
      .patch('/api/v1/me')
      .set(auth)
      .send({ regionDefault: 'MARS' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION');
  });

  it('rejects tokens for deleted users', async () => {
    const h = makeApp();
    const { accessToken } = await signIn(h);
    await db().user.updateMany({ data: { deletedAt: new Date() } });
    await h.req.get('/api/v1/me').set('authorization', `Bearer ${accessToken}`).expect(401);
  });
});

describe('Google sign-in', () => {
  const google = {
    authUrl: (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    exchange: async (code: string) => {
      if (code !== 'good') throw new Error('bad code');
      return { googleId: 'g-123', email: 'Asha@Example.com', name: 'Asha Rao' };
    },
  };

  it('reports provider availability', async () => {
    expect((await makeApp().req.get('/api/v1/auth/providers')).body).toEqual({
      email: true,
      google: false,
    });
    expect((await makeApp({ google }).req.get('/api/v1/auth/providers')).body).toEqual({
      email: true,
      google: true,
    });
    await makeApp().req.get('/api/v1/auth/google/start').expect(404);
  });

  it('completes the OAuth round trip with state verification and links by email', async () => {
    const h = makeApp({ google });
    await db().user.create({ data: { email: 'asha@example.com' } });
    const start = await h.req.get('/api/v1/auth/google/start').expect(302);
    const state = new URL(start.headers['location'] as string).searchParams.get('state')!;
    const stateCookie = (start.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('tailor_gstate='))!
      .split(';')[0]!;

    const cb = await h.req
      .get(`/api/v1/auth/google/callback?code=good&state=${state}`)
      .set('cookie', stateCookie)
      .expect(302);
    expect(cb.headers['location']).toBe(`${h.env.APP_URL}/auth/complete`);
    expect(refreshCookie(cb)).toBeTruthy();
    const users = await db().user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'asha@example.com',
      googleId: 'g-123',
      name: 'Asha Rao',
    });
  });

  it('rejects a state mismatch or failed exchange', async () => {
    const h = makeApp({ google });
    const r1 = await h.req
      .get('/api/v1/auth/google/callback?code=good&state=x')
      .set('cookie', 'tailor_gstate=y')
      .expect(302);
    expect(r1.headers['location']).toBe(`${h.env.APP_URL}/login?error=google`);
    const r2 = await h.req
      .get('/api/v1/auth/google/callback?code=bad&state=x')
      .set('cookie', 'tailor_gstate=x')
      .expect(302);
    expect(r2.headers['location']).toBe(`${h.env.APP_URL}/login?error=google`);
    expect(await db().user.count()).toBe(0);
  });
});

describe('platform', () => {
  it('serves health and 404s in the error envelope', async () => {
    const h = makeApp();
    await h.req.get('/api/v1/health').expect(200, { ok: true });
    const r = await h.req.get('/api/v1/nope').expect(404);
    expect(r.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    expect(r.headers['x-request-id']).toBeTruthy();
  });
});
