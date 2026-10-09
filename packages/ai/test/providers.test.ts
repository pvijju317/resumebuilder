import { describe, expect, it, vi } from 'vitest';
import { anthropic } from '../src/providers/anthropic.js';
import { createProvider } from '../src/providers/index.js';
import { openaiCompatible } from '../src/providers/openai-compatible.js';
import { ProviderError, type CompletionRequest } from '../src/types.js';
import { testEnv } from './helpers.js';
import nvidiaOk from './fixtures/nvidia-chat-completion.json' with { type: 'json' };

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  model: 'nvidia/nemotron-3-super-120b-a12b',
  system: 'sys',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 100,
  temperature: 0.2,
  reasoning: 'off',
  timeoutMs: 1000,
  ...over,
});

const reply = (body: unknown, status = 200) =>
  vi.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );

describe('openaiCompatible', () => {
  it('sends the Nemotron reasoning-off flag and parses usage', async () => {
    const f = reply(nvidiaOk);
    const p = openaiCompatible('nvidia', 'https://integrate.api.nvidia.com/v1/', 'key', f);
    const r = await p.complete(req());
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(body).toMatchObject({
      model: 'nvidia/nemotron-3-super-120b-a12b',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      chat_template_kwargs: { enable_thinking: false },
      stream: false,
    });
    expect(body.response_format).toBeUndefined();
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key');
    expect(r).toMatchObject({
      inputTokens: nvidiaOk.usage.prompt_tokens,
      outputTokens: nvidiaOk.usage.completion_tokens,
    });
    expect(r.text).toBe(nvidiaOk.choices[0]!.message.content);
  });

  it('maps low reasoning and omits flags for unknown models', async () => {
    const f = reply(nvidiaOk);
    const p = openaiCompatible('x', 'http://h', 'k', f);
    await p.complete(req({ reasoning: 'low' }));
    await p.complete(req({ model: 'other/model', reasoning: undefined }));
    const bodies = f.mock.calls.map((c) =>
      JSON.parse(String((c as unknown as [string, RequestInit])[1].body)),
    );
    expect(bodies[0].chat_template_kwargs).toEqual({ enable_thinking: true, low_effort: true });
    expect(bodies[1].chat_template_kwargs).toBeUndefined();
  });

  it.each([
    [429, true],
    [500, true],
    [408, true],
    [400, false],
    [401, false],
  ])('classifies HTTP %i retryable=%s', async (status, retryable) => {
    const p = openaiCompatible('nvidia', 'http://h', 'k', reply('nope', status));
    await expect(p.complete(req())).rejects.toMatchObject({ status, retryable, code: 'http' });
  });

  it('classifies timeouts and network errors as retryable', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const p1 = openaiCompatible(
      'nvidia',
      'http://h',
      'k',
      vi.fn(async () => Promise.reject(timeout)),
    );
    await expect(p1.complete(req())).rejects.toMatchObject({ code: 'timeout', retryable: true });
    const p2 = openaiCompatible(
      'nvidia',
      'http://h',
      'k',
      vi.fn(async () => Promise.reject(new Error('ECONNRESET'))),
    );
    await expect(p2.complete(req())).rejects.toMatchObject({ code: 'network', retryable: true });
  });

  it('treats empty content as retryable and tolerates missing usage', async () => {
    const p = openaiCompatible(
      'nvidia',
      'http://h',
      'k',
      reply({ choices: [{ message: { content: '' } }] }),
    );
    await expect(p.complete(req())).rejects.toBeInstanceOf(ProviderError);
    const p2 = openaiCompatible(
      'nvidia',
      'http://h',
      'k',
      reply({ choices: [{ message: { content: 'x' } }] }),
    );
    await expect(p2.complete(req())).resolves.toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('anthropic adapter', () => {
  it('sends a Messages API request and joins text blocks', async () => {
    const f = reply({
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
      usage: { input_tokens: 5, output_tokens: 3 },
    });
    const r = await anthropic('k', 'https://api.anthropic.com/v1', f).complete(
      req({ model: 'claude-haiku-5-5' }),
    );
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(JSON.parse(String(init.body))).toMatchObject({ system: 'sys', max_tokens: 100 });
    expect(r).toMatchObject({ text: '{"a":1}', inputTokens: 5, outputTokens: 3 });
  });

  it('classifies overload and network errors', async () => {
    await expect(
      anthropic('k', 'http://h', reply('busy', 529)).complete(req()),
    ).rejects.toMatchObject({ retryable: true });
    await expect(
      anthropic('k', 'http://h', reply('bad', 400)).complete(req()),
    ).rejects.toMatchObject({ retryable: false });
    await expect(
      anthropic(
        'k',
        'http://h',
        vi.fn(async () => Promise.reject(new Error('x'))),
      ).complete(req()),
    ).rejects.toMatchObject({ code: 'network' });
    await expect(
      anthropic('k', 'http://h', reply({ content: [] })).complete(req()),
    ).rejects.toMatchObject({ code: 'empty' });
  });
});

describe('createProvider', () => {
  it('requires keys for the selected provider', () => {
    expect(createProvider('nvidia', testEnv()).id).toBe('nvidia');
    expect(() => createProvider('deepinfra', testEnv())).toThrow(/not configured/);
    expect(() => createProvider('openrouter', testEnv())).toThrow(/not configured/);
    expect(() => createProvider('anthropic', testEnv())).toThrow(/not configured/);
    expect(createProvider('deepinfra', testEnv({ DEEPINFRA_API_KEY: 'k' })).id).toBe('deepinfra');
    expect(createProvider('openrouter', testEnv({ OPENROUTER_API_KEY: 'k' })).id).toBe(
      'openrouter',
    );
    expect(createProvider('anthropic', testEnv({ ANTHROPIC_API_KEY: 'k' })).id).toBe('anthropic');
  });
});
