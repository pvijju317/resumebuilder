import { Router, type CookieOptions, type Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { AppError, OtpRequestBody, OtpVerifyBody, type AuthTokens } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import { ipKey, randomToken, safeEqual } from '../lib/crypto.js';
import type { HitCounter } from '../lib/hits.js';
import { parseBody } from '../lib/http.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AuthService, IssuedSession } from '../services/auth.service.js';

export const REFRESH_COOKIE = 'tailor_rt';
const STATE_COOKIE = 'tailor_gstate';
const AUTH_PATH = '/api/v1/auth';

export interface GoogleVerifier {
  authUrl(state: string): string;
  /** Exchanges the code and returns the verified Google identity. */
  exchange(code: string): Promise<{ googleId: string; email: string; name: string | null }>;
}

export function createGoogleVerifier(env: ServerEnv): GoogleVerifier | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const clientId = env.GOOGLE_CLIENT_ID;
  const client = new OAuth2Client({
    clientId,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: `${env.API_URL}${AUTH_PATH}/google/callback`,
  });
  return {
    authUrl: (state) =>
      client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        prompt: 'select_account',
      }),
    async exchange(code) {
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) throw new Error('Google returned no id_token');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified)
        throw new Error('Google account email is not verified');
      return { googleId: p.sub, email: p.email, name: p.name ?? null };
    },
  };
}

export function authRoutes(deps: {
  env: ServerEnv;
  auth: AuthService;
  hits: HitCounter;
  google: GoogleVerifier | null;
}) {
  const { env, auth, hits, google } = deps;
  const r = Router();
  const secure = env.NODE_ENV === 'production';
  const cookieBase: CookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: AUTH_PATH };

  const perIp = rateLimit({
    hits,
    name: 'auth',
    limit: env.AUTH_RATE_LIMIT_PER_MIN,
    windowMs: 60_000,
    key: (req) => ipKey(req.ip),
  });

  const sendSession = (res: Response, s: IssuedSession) => {
    res.cookie(REFRESH_COOKIE, s.refreshToken, { ...cookieBase, expires: s.refreshExpiresAt });
    const body: AuthTokens = { accessToken: s.accessToken, expiresIn: s.expiresIn };
    res.json(body);
  };

  r.get('/providers', (_req, res) => {
    res.json({ email: true, google: google !== null, trialOpen: env.AUTH_MODE === 'trial_open' });
  });

  r.post('/otp/request', perIp, async (req, res) => {
    const { email } = parseBody(OtpRequestBody, req.body);
    await auth.requestOtp(email);
    res.status(204).end();
  });

  r.post('/otp/verify', perIp, async (req, res) => {
    const { email, code } = parseBody(OtpVerifyBody, req.body);
    sendSession(res, await auth.verifyOtp(email, code, req.get('user-agent')));
  });

  // Trial only (AUTH_MODE=trial_open): email alone, no verification.
  r.post('/trial', perIp, async (req, res) => {
    const { email } = parseBody(OtpRequestBody, req.body);
    sendSession(res, await auth.trialSignIn(email, req.get('user-agent')));
  });

  r.post('/refresh', async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new AppError('UNAUTHORIZED', 'Please sign in.', 401);
    try {
      sendSession(res, await auth.refresh(token, req.get('user-agent')));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, cookieBase);
      throw e;
    }
  });

  r.post('/logout', async (req, res) => {
    await auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, cookieBase);
    res.status(204).end();
  });

  r.get('/google/start', perIp, (_req, res) => {
    if (!google) throw new AppError('NOT_FOUND', 'Google sign-in is not enabled.', 404);
    const state = randomToken(16);
    res.cookie(STATE_COOKIE, state, {
      ...cookieBase,
      path: `${AUTH_PATH}/google`,
      maxAge: 10 * 60_000,
    });
    res.redirect(google.authUrl(state));
  });

  r.get('/google/callback', async (req, res) => {
    const fail = (reason: string) =>
      res.redirect(`${env.APP_URL}/login?error=${encodeURIComponent(reason)}`);
    const expected = req.cookies?.[STATE_COOKIE] as string | undefined;
    res.clearCookie(STATE_COOKIE, { ...cookieBase, path: `${AUTH_PATH}/google` });
    const { code, state } = req.query;
    if (
      !google ||
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      !expected ||
      !safeEqual(state, expected)
    ) {
      fail('google');
      return;
    }
    try {
      const identity = await google.exchange(code);
      const s = await auth.signInWithGoogle(identity, req.get('user-agent'));
      res.cookie(REFRESH_COOKIE, s.refreshToken, { ...cookieBase, expires: s.refreshExpiresAt });
      // The web app exchanges the refresh cookie for an access token on /auth/complete.
      res.redirect(`${env.APP_URL}/auth/complete`);
    } catch (e) {
      req.log?.warn({ err: e }, 'google sign-in failed');
      fail('google');
    }
  });

  return r;
}
