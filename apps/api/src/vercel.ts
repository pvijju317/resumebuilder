import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import { loadEnv } from './env.js';
import { buildRuntime } from './runtime.js';

/**
 * Vercel Function entry (Build Output API; see scripts/vercel-build.mjs). Background jobs run
 * after the response via waitUntil. If startup fails (usually a missing setting), every request
 * answers 503 naming the offending env vars (names only, never values) instead of crashing.
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let app: Handler | null = null;
let bootError: unknown = null;
try {
  app = buildRuntime(loadEnv(), { schedule: (p) => waitUntil(p) }).app as unknown as Handler;
} catch (e) {
  bootError = e;
  console.error('API boot failed', e);
}

/** Env var names from a parseEnv error ("  NAME: message" lines). */
export function settingNames(err: unknown): string[] {
  const text = err instanceof Error ? err.message : String(err);
  if (!text.startsWith('Invalid environment configuration')) return [];
  return [...text.matchAll(/^\s{2}([A-Z0-9_]+):/gm)].map((m) => m[1]!);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (app) return app(req, res);
  const names = settingNames(bootError);
  res.statusCode = 503;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      error: {
        code: 'MISCONFIGURED',
        message: names.length ? `Missing or invalid settings: ${names.join(', ')}` : 'The server failed to start. Check the function logs.',
      },
    }),
  );
}
