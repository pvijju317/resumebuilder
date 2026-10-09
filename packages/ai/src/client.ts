import { AppError, type Tier } from '@tailor/shared';
import type { AiEnv, ProviderId } from '@tailor/shared/env';
import { z } from 'zod';
import { createProvider } from './providers/index.js';
import type { RateLimiter } from './rate-limiter.js';
import { TASKS, loadPrompt, type TaskName, type TaskInput, type TaskOutput } from './registry.js';
import { resolveRoute, type Target } from './routing.js';
import { extractJson, stripThink } from './text.js';
import { ProviderError, type CompletionRequest, type LLMProvider } from './types.js';

export type CallStatus = 'ok' | 'retry' | 'fail' | 'fallback';

/** One row for AiCallLog. Prompt/response bodies only when AI_DEBUG_LOG and not production. */
export interface CallLogEntry {
  task: string;
  promptVersion: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: CallStatus;
  errorCode: string | null;
  userId: string | null;
  refId: string | null;
  debug?: { system: string; user: string; response: string | null };
}

export interface CallLogSink {
  record(entry: CallLogEntry): Promise<void>;
}

export interface RunContext {
  tier?: Tier;
  userId?: string;
  refId?: string;
  /** Eval/admin only: force a model (`provider:model` allowed). Disables fallback. */
  modelOverride?: string;
}

export interface RunResult<T> {
  output: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** Provider calls made, including retries and the repair call. */
  calls: number;
  repaired: boolean;
  usedFallback: boolean;
  rawText: string;
}

export interface AiClientDeps {
  env: AiEnv;
  limiter: RateLimiter;
  sink?: CallLogSink;
  /** Injected for tests; otherwise built from env on first use. */
  providers?: Partial<Record<ProviderId, LLMProvider>>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

/** TRD §5.3: 1 s, 3 s, 9 s with jitter, max 3 retries. */
export const BACKOFF_MS = [1_000, 3_000, 9_000] as const;
export const HIGH_DEMAND_MESSAGE = 'High demand — retrying shortly';

export class AiClient {
  private readonly providers: Partial<Record<ProviderId, LLMProvider>>;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly deps: AiClientDeps) {
    this.providers = { ...deps.providers };
    this.sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    this.random = deps.random ?? Math.random;
    this.now = deps.now ?? Date.now;
  }

  async run<T extends TaskName>(
    taskName: T,
    rawInput: TaskInput<T>,
    ctx: RunContext = {},
  ): Promise<RunResult<TaskOutput<T>>> {
    const task = TASKS[taskName];
    const parsedInput = task.input.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new AppError('VALIDATION', `Invalid input for ${taskName}`, 400, {
        cause: parsedInput.error,
      });
    }

    const jsonSchema = z.toJSONSchema(task.output, { io: 'input' }) as object;
    const system = `${loadPrompt(task.name, task.promptVersion)}\n\nJSON Schema for your output:\n${JSON.stringify(jsonSchema)}`;
    const user = JSON.stringify(parsedInput.data);
    const route = resolveRoute(task, this.deps.env, ctx);
    const base: Omit<CompletionRequest, 'model'> = {
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: task.maxTokens,
      temperature: task.temperature,
      jsonSchema,
      reasoning: 'off',
      timeoutMs: this.deps.env.AI_TIMEOUT_MS,
    };
    const log: LogFn = (target, partial, response = null) =>
      this.record({
        task: task.name,
        promptVersion: task.promptVersion,
        provider: target.provider,
        model: target.model,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        errorCode: null,
        userId: ctx.userId ?? null,
        refId: ctx.refId ?? null,
        ...partial,
        // The only place bodies are attached — never in production (CLAUDE.md, TRD §5.3).
        ...(this.debugEnabled() ? { debug: { system, user, response } } : {}),
      });

    let calls = 0;
    let target = route.primary;
    let usedFallback = false;
    let first = await this.callWithRetries(target, base, log, () => calls++);
    if (!first && route.fallback) {
      target = route.fallback;
      usedFallback = true;
      first = await this.callWithRetries(target, base, log, () => calls++, 'fallback');
    }
    if (!first) throw new AppError('AI_UNAVAILABLE', HIGH_DEMAND_MESSAGE, 503);

    let { res, latencyMs } = first;
    let inputTokens = res.inputTokens;
    let outputTokens = res.outputTokens;
    let parsed = parseOutput(task.output, res.text);
    let repaired = false;

    if (!parsed.ok) {
      repaired = true;
      const repair = await this.callWithRetries(
        target,
        {
          ...base,
          temperature: 0,
          messages: [
            ...base.messages,
            { role: 'assistant', content: res.text.slice(0, 20_000) },
            {
              role: 'user',
              content: `Return valid JSON matching this schema; previous output failed validation: ${parsed.error}. Output only the JSON object.`,
            },
          ],
        },
        log,
        () => calls++,
      );
      if (!repair) throw new AppError('AI_UNAVAILABLE', HIGH_DEMAND_MESSAGE, 503);
      res = repair.res;
      latencyMs += repair.latencyMs;
      inputTokens += res.inputTokens;
      outputTokens += res.outputTokens;
      parsed = parseOutput(task.output, res.text);
      if (!parsed.ok) {
        await log(target, { status: 'fail', errorCode: 'invalid_output' });
        throw new AppError(
          'AI_INVALID_OUTPUT',
          'We could not generate a valid result. Please try again.',
          502,
          { cause: parsed.error },
        );
      }
    }

    return {
      output: parsed.value as TaskOutput<T>,
      provider: target.provider,
      model: target.model,
      inputTokens,
      outputTokens,
      latencyMs,
      calls,
      repaired,
      usedFallback,
      rawText: res.text,
    };
  }

  /** Returns null when retries are exhausted (or a non-retryable error occurs). */
  private async callWithRetries(
    target: Target,
    base: Omit<CompletionRequest, 'model'>,
    log: LogFn,
    countCall: () => void,
    successStatus: CallStatus = 'ok',
  ) {
    const provider = this.provider(target.provider);
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      await this.deps.limiter.acquire(target.provider);
      const started = this.now();
      countCall();
      try {
        const res = await provider.complete({ ...base, model: target.model });
        res.text = stripThink(res.text);
        const latencyMs = this.now() - started;
        await log(
          target,
          {
            status: successStatus,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            latencyMs,
          },
          res.text,
        );
        return { res, latencyMs };
      } catch (e) {
        const latencyMs = this.now() - started;
        const pe = e instanceof ProviderError ? e : null;
        const retryable = pe?.retryable ?? false;
        const lastAttempt = attempt === BACKOFF_MS.length;
        await log(target, {
          status: retryable && !lastAttempt ? 'retry' : 'fail',
          latencyMs,
          errorCode: pe ? `${pe.code}${pe.status ? `_${pe.status}` : ''}` : 'unknown',
        });
        if (!retryable || lastAttempt) return null;
        const jitter = 0.8 + this.random() * 0.4;
        await this.sleep(Math.round(BACKOFF_MS[attempt]! * jitter));
      }
    }
    return null;
  }

  private provider(id: ProviderId): LLMProvider {
    let p = this.providers[id];
    if (!p) {
      p = createProvider(id, this.deps.env);
      this.providers[id] = p;
    }
    return p;
  }

  private debugEnabled() {
    return this.deps.env.AI_DEBUG_LOG && this.deps.env.NODE_ENV !== 'production';
  }

  private async record(entry: CallLogEntry) {
    try {
      await this.deps.sink?.record(entry);
    } catch (e) {
      console.warn('AiCallLog sink failed', e instanceof Error ? e.message : e);
    }
  }
}

type LogFn = (
  target: Target,
  entry: Partial<Omit<CallLogEntry, 'debug'>> & Pick<CallLogEntry, 'status'>,
  response?: string | null,
) => Promise<void>;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseOutput<S extends z.ZodType>(schema: S, text: string): Parsed<z.infer<S>> {
  const json = extractJson(text);
  if (!json) return { ok: false, error: 'no JSON object found' };
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${(e as Error).message}` };
  }
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }
  return { ok: true, value: r.data };
}
