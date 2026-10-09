import { describe, expect, it, vi } from 'vitest';
import { AiClient, BACKOFF_MS, HIGH_DEMAND_MESSAGE } from '../src/client.js';
import { resolveRoute, parseTarget } from '../src/routing.js';
import { TASKS } from '../src/registry.js';
import { ProviderError } from '../src/types.js';
import {
  memorySink,
  noLimit,
  rewriteInput,
  scriptedProvider,
  testEnv,
  validRewrite,
} from './helpers.js';

const http = (status: number) =>
  new ProviderError(`HTTP ${status}`, status, status === 429 || status >= 500, 'http');

function client(
  steps: Parameters<typeof scriptedProvider>[1],
  opts: { env?: Record<string, string>; fallback?: Parameters<typeof scriptedProvider>[1] } = {},
) {
  const primary = scriptedProvider('nvidia', steps);
  const fb = scriptedProvider('deepinfra', opts.fallback ?? []);
  const { sink, entries } = memorySink();
  const sleep = vi.fn(async () => undefined);
  const c = new AiClient({
    env: testEnv(opts.env),
    limiter: noLimit,
    sink,
    providers: { nvidia: primary.provider, deepinfra: fb.provider },
    sleep,
    random: () => 0.5, // jitter factor 1.0
  });
  return { c, primary, fb, entries, sleep };
}

describe('AiClient.run', () => {
  it('returns validated output and logs one ok call', async () => {
    const { c, primary, entries } = client([validRewrite]);
    const r = await c.run('resume.rewrite', rewriteInput, { userId: 'u1', refId: 'o1' });
    expect(r.output.bullets[0]?.sourceIds).toEqual(['a1']);
    expect(r).toMatchObject({
      provider: 'nvidia',
      model: 'nvidia/nemotron-3-super-120b-a12b',
      calls: 1,
      repaired: false,
    });
    expect(primary.requests[0]).toMatchObject({
      reasoning: 'off',
      temperature: 0.4,
      maxTokens: 3000,
    });
    expect(primary.requests[0]?.system).toContain('JSON Schema for your output');
    expect(entries).toMatchObject([
      {
        task: 'resume.rewrite',
        promptVersion: 'v1',
        status: 'ok',
        userId: 'u1',
        refId: 'o1',
        inputTokens: 100,
      },
    ]);
    expect(entries[0]?.debug).toBeUndefined();
  });

  it('strips <think> traces before parsing', async () => {
    const { c } = client([`<think>let me plan</think>${validRewrite}`]);
    await expect(c.run('resume.rewrite', rewriteInput)).resolves.toMatchObject({ repaired: false });
  });

  it('repairs invalid output once at temperature 0', async () => {
    const { c, primary } = client(['{"summary": "x"}', validRewrite]);
    const r = await c.run('resume.rewrite', rewriteInput);
    expect(r).toMatchObject({ repaired: true, calls: 2, inputTokens: 200 });
    expect(primary.requests[1]?.temperature).toBe(0);
    expect(primary.requests[1]?.messages.at(-1)?.content).toMatch(
      /Return valid JSON matching this schema/,
    );
    expect(primary.requests[1]?.messages[1]).toEqual({
      role: 'assistant',
      content: '{"summary": "x"}',
    });
  });

  it('fails cleanly when repair also fails', async () => {
    const { c, entries } = client(['not json', 'still not json']);
    await expect(c.run('resume.rewrite', rewriteInput)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
      httpStatus: 502,
    });
    expect(entries.at(-1)).toMatchObject({ status: 'fail', errorCode: 'invalid_output' });
  });

  it('reports malformed JSON in the repair prompt', async () => {
    const { c, primary } = client(['{"summary": }', validRewrite]);
    await c.run('resume.rewrite', rewriteInput);
    expect(primary.requests[1]?.messages.at(-1)?.content).toMatch(/invalid JSON/);
  });

  it('retries 429/5xx with 1s/3s/9s backoff then succeeds', async () => {
    const { c, sleep, entries } = client([http(429), http(503), validRewrite]);
    const r = await c.run('resume.rewrite', rewriteInput);
    expect(r.calls).toBe(3);
    expect(sleep.mock.calls.map((a) => (a as unknown[])[0])).toEqual([
      BACKOFF_MS[0],
      BACKOFF_MS[1],
    ]);
    expect(entries.map((e) => [e.status, e.errorCode])).toEqual([
      ['retry', 'http_429'],
      ['retry', 'http_503'],
      ['ok', null],
    ]);
  });

  it('falls back to the fallback provider after max retries', async () => {
    const { c, fb, entries, sleep } = client([http(429), http(429), http(429), http(429)], {
      env: {
        AI_PROVIDER_FALLBACK: 'deepinfra',
        AI_FALLBACK_MODEL_STANDARD: 'nvidia/Nemotron-Super',
      },
      fallback: [validRewrite],
    });
    const r = await c.run('resume.rewrite', rewriteInput);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({
      provider: 'deepinfra',
      model: 'nvidia/Nemotron-Super',
      usedFallback: true,
      calls: 5,
    });
    expect(fb.requests).toHaveLength(1);
    expect(entries.map((e) => e.status)).toEqual(['retry', 'retry', 'retry', 'fail', 'fallback']);
  });

  it('throws the high-demand error when retries are exhausted and no fallback exists', async () => {
    const { c } = client([http(500), http(500), http(500), http(500)]);
    await expect(c.run('resume.rewrite', rewriteInput)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      message: HIGH_DEMAND_MESSAGE,
      httpStatus: 503,
    });
  });

  it('does not retry non-retryable errors', async () => {
    const { c, sleep, entries } = client([http(400)]);
    await expect(c.run('resume.rewrite', rewriteInput)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(entries).toMatchObject([{ status: 'fail', errorCode: 'http_400' }]);
  });

  it('treats unknown errors as non-retryable', async () => {
    const { c, entries } = client([new Error('boom')]);
    await expect(c.run('resume.rewrite', rewriteInput)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(entries[0]?.errorCode).toBe('unknown');
  });

  it('fails when the repair call cannot be made', async () => {
    const { c } = client(['bad', http(400)]);
    await expect(c.run('resume.rewrite', rewriteInput)).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
  });

  it('rejects invalid task input before calling a provider', async () => {
    const { c, primary } = client([]);
    // @ts-expect-error deliberately invalid
    await expect(c.run('resume.rewrite', { items: [] })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(primary.requests).toHaveLength(0);
  });

  it('includes prompt/response bodies only when AI_DEBUG_LOG in non-production', async () => {
    const dev = client([validRewrite], { env: { AI_DEBUG_LOG: 'true', NODE_ENV: 'development' } });
    await dev.c.run('resume.rewrite', rewriteInput);
    expect(dev.entries[0]?.debug?.response).toContain('summary');
    const prod = client([validRewrite], { env: { AI_DEBUG_LOG: 'true', NODE_ENV: 'production' } });
    await prod.c.run('resume.rewrite', rewriteInput);
    expect(prod.entries[0]?.debug).toBeUndefined();
  });

  it('survives a failing log sink', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = scriptedProvider('nvidia', [validRewrite]);
    const c = new AiClient({
      env: testEnv(),
      limiter: noLimit,
      sink: { record: async () => Promise.reject(new Error('db down')) },
      providers: { nvidia: p.provider },
    });
    await expect(c.run('resume.rewrite', rewriteInput)).resolves.toBeTruthy();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('acquires a rate-limit slot for every provider call', async () => {
    const acquire = vi.fn(async () => undefined);
    const p = scriptedProvider('nvidia', [http(429), validRewrite]);
    const c = new AiClient({
      env: testEnv(),
      limiter: { acquire },
      providers: { nvidia: p.provider },
      sleep: async () => undefined,
    });
    await c.run('resume.rewrite', rewriteInput);
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire).toHaveBeenCalledWith('nvidia');
  });
});

describe('routing', () => {
  const env = testEnv({ AI_TASK_OVERRIDES: '{"jd.extract":"openrouter:some/model"}' });

  it('maps model classes and tiers to env models', () => {
    expect(resolveRoute(TASKS['vault.parse'], env).primary.model).toBe(env.AI_MODEL_PREMIUM);
    expect(resolveRoute(TASKS['coverLetter.generate'], env).primary.model).toBe(
      env.AI_MODEL_STANDARD,
    );
    expect(resolveRoute(TASKS['resume.rewrite'], env).primary.model).toBe(env.AI_MODEL_STANDARD);
    expect(resolveRoute(TASKS['resume.rewrite'], env, { tier: 'premium' }).primary.model).toBe(
      env.AI_MODEL_PREMIUM,
    );
  });

  it('applies per-task overrides with provider prefixes', () => {
    expect(resolveRoute(TASKS['jd.extract'], env).primary).toEqual({
      provider: 'openrouter',
      model: 'some/model',
    });
  });

  it('builds a fallback only when provider and model are configured, never with an explicit override', () => {
    expect(resolveRoute(TASKS['resume.rewrite'], env).fallback).toBeNull();
    const fbEnv = testEnv({
      AI_PROVIDER_FALLBACK: 'anthropic',
      AI_FALLBACK_MODEL_PREMIUM: 'claude-haiku-5-5',
    });
    expect(resolveRoute(TASKS['vault.parse'], fbEnv).fallback).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
    expect(resolveRoute(TASKS['vault.parse'], fbEnv, { modelOverride: 'x' }).fallback).toBeNull();
  });

  it('parses provider-prefixed targets', () => {
    expect(parseTarget('deepinfra:a/b', 'nvidia')).toEqual({ provider: 'deepinfra', model: 'a/b' });
    expect(parseTarget('nvidia/nemotron', 'nvidia')).toEqual({
      provider: 'nvidia',
      model: 'nvidia/nemotron',
    });
  });
});
