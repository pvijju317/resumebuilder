import { describe, expect, it } from 'vitest';
import { AiEnv, ServerEnv, parseEnv } from '../src/env.js';
import { AppError, OtpVerifyBody, YearMonth } from '../src/index.js';

const ai = { AI_MODEL_STANDARD: 'std', AI_MODEL_PREMIUM: 'prem' };
const server = {
  ...ai,
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:4000',
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  SES_FROM: 'Tailor <a@b.c>',
  JWT_SECRET: 'x'.repeat(32),
  REFRESH_SECRET: 'y'.repeat(32),
};

describe('AiEnv', () => {
  it('applies TRD defaults', () => {
    const env = parseEnv(AiEnv, ai);
    expect(env).toMatchObject({
      AI_PROVIDER_PRIMARY: 'nvidia',
      AI_RPM_LIMIT: 35,
      AI_RPM_BURST: 3,
      AI_TIMEOUT_MS: 45_000,
      AI_DEBUG_LOG: false,
      NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
      AI_TASK_OVERRIDES: {},
    });
    expect(env.AI_PROVIDER_FALLBACK).toBeUndefined();
    expect(env.NVIDIA_API_KEY).toBeUndefined();
  });

  it('parses overrides JSON, booleans and empty strings', () => {
    const env = parseEnv(AiEnv, {
      ...ai,
      AI_TASK_OVERRIDES: '{"jd.extract":"deepinfra:x"}',
      AI_DEBUG_LOG: 'true',
      AI_PROVIDER_FALLBACK: '',
      NVIDIA_API_KEY: '',
    });
    expect(env.AI_TASK_OVERRIDES).toEqual({ 'jd.extract': 'deepinfra:x' });
    expect(env.AI_DEBUG_LOG).toBe(true);
    expect(env.AI_PROVIDER_FALLBACK).toBeUndefined();
    expect(env.NVIDIA_API_KEY).toBeUndefined();
  });

  it('reports every invalid key in one error', () => {
    expect(() =>
      parseEnv(AiEnv, { AI_TASK_OVERRIDES: '{bad', AI_PROVIDER_PRIMARY: 'acme' }),
    ).toThrow(/AI_PROVIDER_PRIMARY[\s\S]*AI_MODEL_STANDARD[\s\S]*AI_TASK_OVERRIDES: Invalid JSON/);
  });
});

describe('ServerEnv', () => {
  it('requires strong secrets', () => {
    expect(() => parseEnv(ServerEnv, { ...server, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(parseEnv(ServerEnv, server).AUTH_RATE_LIMIT_PER_MIN).toBe(5);
  });
});

describe('contracts', () => {
  it('validates vault dates and OTP bodies', () => {
    expect(YearMonth.safeParse('2024-07').success).toBe(true);
    expect(YearMonth.safeParse('2024-13').success).toBe(false);
    expect(OtpVerifyBody.parse({ email: ' A@B.co ', code: '123456' }).email).toBe('a@b.co');
  });

  it('serializes AppError without internal detail', () => {
    const e = new AppError('NOT_FOUND', 'Not found', 404, { cause: new Error('db detail') });
    expect(JSON.stringify(e)).toBe('{"error":{"code":"NOT_FOUND","message":"Not found"}}');
  });
});

describe('ProfilePatch', () => {
  it('does not inject defaults for omitted fields', async () => {
    const { ProfilePatch } = await import('../src/index.js');
    expect(ProfilePatch.parse({ headline: 'x' })).toEqual({ headline: 'x' });
  });
});
