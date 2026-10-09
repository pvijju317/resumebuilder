import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ServerEnv, parseEnv } from '@tailor/shared/env';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

/**
 * Host-provided fallbacks so a Vercel deployment needs fewer manual settings:
 * the app's own URL from VERCEL_PROJECT_PRODUCTION_URL, Redis from Upstash's KV_URL.
 */
export function withHostDefaults(
  src: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const vercelUrl = src['VERCEL_PROJECT_PRODUCTION_URL']
    ? `https://${src['VERCEL_PROJECT_PRODUCTION_URL']}`
    : undefined;
  return {
    ...src,
    APP_URL: src['APP_URL'] || vercelUrl,
    API_URL: src['API_URL'] || vercelUrl,
    REDIS_URL: src['REDIS_URL'] || src['KV_URL'],
  };
}

export const loadEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(ServerEnv, withHostDefaults(source));
export type { ServerEnv };
