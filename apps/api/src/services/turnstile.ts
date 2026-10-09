import type { ServerEnv } from '@tailor/shared/env';

export interface HumanCheck {
  verify(token: string, ip: string | undefined): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare Turnstile server-side validation (tokens are single-use, valid for 5 minutes). */
export function createTurnstile(env: ServerEnv, fetchImpl: typeof fetch = fetch): HumanCheck {
  if (!env.TURNSTILE_SECRET) {
    if (env.NODE_ENV === 'production')
      throw new Error('TURNSTILE_SECRET is required in production');
    return { verify: async () => true };
  }
  const secret = env.TURNSTILE_SECRET;
  return {
    async verify(token, ip) {
      try {
        const res = await fetchImpl(SITEVERIFY, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
          signal: AbortSignal.timeout(5000),
        });
        const body = (await res.json()) as { success?: boolean };
        return body.success === true;
      } catch {
        return false;
      }
    },
  };
}
