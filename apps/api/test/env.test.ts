import { describe, expect, it } from 'vitest';
import { withHostDefaults } from '../src/env.js';

describe('withHostDefaults', () => {
  it('derives URLs from Vercel and Redis from Upstash KV_URL', () => {
    expect(
      withHostDefaults({
        VERCEL_PROJECT_PRODUCTION_URL: 'tailor.vercel.app',
        KV_URL: 'rediss://u:p@x.upstash.io:6379',
      }),
    ).toMatchObject({
      APP_URL: 'https://tailor.vercel.app',
      API_URL: 'https://tailor.vercel.app',
      REDIS_URL: 'rediss://u:p@x.upstash.io:6379',
    });
  });

  it('never overrides explicit values', () => {
    expect(
      withHostDefaults({
        APP_URL: 'https://a.example',
        VERCEL_PROJECT_PRODUCTION_URL: 'b.vercel.app',
        REDIS_URL: 'redis://local',
        KV_URL: 'rediss://kv',
      }),
    ).toMatchObject({
      APP_URL: 'https://a.example',
      API_URL: 'https://b.vercel.app',
      REDIS_URL: 'redis://local',
    });
  });
});
