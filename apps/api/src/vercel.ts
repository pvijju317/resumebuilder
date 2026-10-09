import { waitUntil } from '@vercel/functions';
import { loadEnv } from './env.js';
import { buildRuntime } from './runtime.js';

/**
 * Vercel Function entry (Build Output API; see scripts/vercel-build.mjs). Background jobs run
 * after the response via waitUntil, within the function's max duration.
 */
const { app } = buildRuntime(loadEnv(), { schedule: (p) => waitUntil(p) });

export default app;
