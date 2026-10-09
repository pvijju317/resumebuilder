import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ServerEnv, parseEnv } from '@tailor/shared/env';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

export const loadEnv = (source: Record<string, string | undefined> = process.env) =>
  parseEnv(ServerEnv, source);
export type { ServerEnv };
