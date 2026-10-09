import { describe, expect, it } from 'vitest';
import { parseEnv, ServerEnv } from '@tailor/shared/env';

describe('settingNames', () => {
  it('lists only the env var names from a parseEnv error', async () => {
    let err: unknown;
    try {
      parseEnv(ServerEnv, { AI_MODEL_STANDARD: 'x', AI_MODEL_PREMIUM: 'y', JWT_SECRET: 'super-secret-but-too-short' });
    } catch (e) {
      err = e;
    }
    // Import lazily: the module boots a runtime at load, which must fail without env here.
    const { settingNames } = await import('../src/vercel.js');
    const names = settingNames(err);
    expect(names).toEqual(expect.arrayContaining(['APP_URL', 'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET']));
    expect(names.join(' ')).not.toContain('super-secret');
    expect(settingNames(new Error('something else'))).toEqual([]);
  });
});
