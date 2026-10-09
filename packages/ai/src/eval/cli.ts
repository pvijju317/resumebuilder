/**
 * Eval harness (TRD §5.5).
 *   pnpm eval --task resume.rewrite --models a,b --dataset evals/pairs.jsonl [--concurrency 2] [--limit N] [--seed 42]
 * Writes evals/runs/<timestamp>-<task>/{results.jsonl, summary.json, report.html, key.json}.
 */
import { AiEnv, parseEnv } from '@tailor/shared/env';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AiClient, type CallLogEntry } from '../client.js';
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from '../rate-limiter.js';
import { TASKS, isTaskName, type TaskName } from '../registry.js';
import { GenericPair, RewritePair, readJsonl } from './dataset.js';
import { promptRegion, rewriteMetrics, type RewriteMetrics } from './metrics.js';
import { renderBlindReport, type BlindPair } from './report.js';

const ROOT = resolve(import.meta.dirname, '../../../..');
config({ path: resolve(ROOT, '.env'), quiet: true });

const { values } = parseArgs({
  options: {
    task: { type: 'string', default: 'resume.rewrite' },
    models: { type: 'string' },
    dataset: { type: 'string', default: 'evals/pairs.jsonl' },
    concurrency: { type: 'string', default: '2' },
    limit: { type: 'string' },
    seed: { type: 'string', default: String(Date.now()) },
    out: { type: 'string' },
  },
});

const taskArg = values.task!;
if (!isTaskName(taskArg))
  throw new Error(`Unknown task "${taskArg}". Known: ${Object.keys(TASKS).join(', ')}`);
const task: TaskName = taskArg;
const env = parseEnv(AiEnv, process.env);
const models = (values.models ?? `${env.AI_MODEL_STANDARD},${env.AI_MODEL_PREMIUM}`)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const datasetPath = resolve(ROOT, values.dataset!);
const concurrency = Math.max(1, Number(values.concurrency));

/** Deterministic shuffle so a run's blind labels are reproducible from its seed. */
function shuffled<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function makeLimiter(): Promise<{ limiter: RateLimiter; close: () => Promise<void> }> {
  const cfg = { rpm: env.AI_RPM_LIMIT, burst: env.AI_RPM_BURST, maxWaitMs: 10 * 60_000 };
  const url = process.env['REDIS_URL'];
  if (url) {
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    redis.on('error', () => undefined); // connection failure is handled below
    try {
      await redis.connect();
      return {
        limiter: new RedisRateLimiter(redis, cfg),
        close: async () => void (await redis.quit()),
      };
    } catch {
      redis.disconnect();
    }
  }
  console.warn(
    'eval: Redis unavailable — using in-process rate limiter (do not run alongside workers)',
  );
  return { limiter: new MemoryRateLimiter(cfg), close: async () => undefined };
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) await fn(t);
    }),
  );
}

interface Row {
  pairId: string;
  model: string;
  ok: boolean;
  error: string | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  repaired: boolean;
  output: unknown;
  metrics: RewriteMetrics | null;
}

async function main() {
  const createdAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = resolve(ROOT, values.out ?? `evals/runs/${createdAt}-${task}`);
  mkdirSync(outDir, { recursive: true });

  const { limiter, close } = await makeLimiter();
  const logs: CallLogEntry[] = [];
  const client = new AiClient({ env, limiter, sink: { record: async (e) => void logs.push(e) } });

  const isRewrite = task === 'resume.rewrite';
  const rewritePairs = isRewrite ? readJsonl(datasetPath, RewritePair) : [];
  const genericPairs = isRewrite ? [] : readJsonl(datasetPath, GenericPair);
  const limit = values.limit ? Number(values.limit) : Infinity;
  const ids = (isRewrite ? rewritePairs : genericPairs).map((p) => p.id).slice(0, limit);

  console.log(
    `eval: ${task} · ${ids.length} pairs × ${models.length} models (${models.join(', ')}) · rpm ${env.AI_RPM_LIMIT}`,
  );
  const rows: Row[] = [];
  const jobs = ids.flatMap((pairId) => models.map((model) => ({ pairId, model })));

  await pool(jobs, concurrency, async ({ pairId, model }) => {
    const pair = rewritePairs.find((p) => p.id === pairId);
    const input = pair
      ? {
          jd: pair.jd,
          region: promptRegion(pair.region),
          tone: pair.tone,
          pageTarget: pair.pageTarget,
          items: pair.items.map(({ startDate: _s, endDate: _e, variants: _v, ...it }) => it),
        }
      : genericPairs.find((p) => p.id === pairId)!.input;
    const started = Date.now();
    try {
      const r = await client.run(task, input as never, {
        modelOverride: model,
        refId: `eval:${pairId}`,
      });
      const metrics = pair ? rewriteMetrics(pair, r.output as never) : null;
      rows.push({
        pairId,
        model,
        ok: true,
        error: null,
        latencyMs: r.latencyMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        calls: r.calls,
        repaired: r.repaired,
        output: r.output,
        metrics,
      });
      console.log(
        `  ✓ ${pairId} · ${model} · ${r.latencyMs} ms${r.repaired ? ' · repaired' : ''}${metrics ? ` · FG ${metrics.factGuardViolations} · must ${metrics.mustHaveAfter}/${metrics.mustHaveSupported}` : ''}`,
      );
    } catch (e) {
      const msg =
        e instanceof Error
          ? `${e.message}${e.cause ? ` (${String((e.cause as Error).message ?? e.cause).slice(0, 300)})` : ''}`
          : String(e);
      rows.push({
        pairId,
        model,
        ok: false,
        error: msg,
        latencyMs: Date.now() - started,
        inputTokens: 0,
        outputTokens: 0,
        calls: 0,
        repaired: false,
        output: null,
        metrics: null,
      });
      console.log(`  ✗ ${pairId} · ${model} · ${msg}`);
    }
  });
  await close();

  const pct = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! : 0;
  };
  const summary = models.map((model) => {
    const rs = rows.filter((r) => r.model === model);
    const ok = rs.filter((r) => r.ok);
    const ms = ok.map((r) => r.metrics).filter((m): m is RewriteMetrics => m !== null);
    const sum = (f: (m: RewriteMetrics) => number) => ms.reduce((a, m) => a + f(m), 0);
    const totalBullets = sum((m) => m.bulletCount);
    return {
      model,
      runs: rs.length,
      jsonValid: ok.length,
      jsonValidWithoutRepair: ok.filter((r) => !r.repaired).length,
      latencyP50Ms: pct(
        ok.map((r) => r.latencyMs),
        50,
      ),
      latencyP95Ms: pct(
        ok.map((r) => r.latencyMs),
        95,
      ),
      avgInputTokens: Math.round(ok.reduce((a, r) => a + r.inputTokens, 0) / (ok.length || 1)),
      avgOutputTokens: Math.round(ok.reduce((a, r) => a + r.outputTokens, 0) / (ok.length || 1)),
      ...(ms.length
        ? {
            mustHaveCoverage: Number(
              (sum((m) => m.mustHaveAfter) / (sum((m) => m.mustHaveSupported) || 1)).toFixed(3),
            ),
            factGuardViolations: sum((m) => m.factGuardViolations),
            bulletViolationRate: Number(
              (
                (sum((m) => m.bulletsReverted) + sum((m) => m.bulletsDropped)) /
                (totalBullets || 1)
              ).toFixed(3),
            ),
            asks: sum((m) => m.asks),
            bulletsOverLength: sum((m) => m.bulletsOverLength),
            bulletCountMismatches: ms.filter((m) => m.bulletCount !== m.expectedBullets).length,
            firstPersonBullets: sum((m) => m.firstPerson),
          }
        : {}),
    };
  });

  writeFileSync(
    resolve(outDir, 'results.jsonl'),
    rows.map((r) => JSON.stringify(r)).join('\n') + '\n',
  );
  writeFileSync(
    resolve(outDir, 'summary.json'),
    JSON.stringify(
      { task, dataset: values.dataset, createdAt, models, summary, calls: logs.length },
      null,
      2,
    ),
  );

  if (isRewrite) {
    const seed = Number(values.seed);
    const key: Record<string, Record<string, string>> = {};
    const blind: BlindPair[] = ids.map((pairId, i) => {
      const order = shuffled(models, seed + i);
      key[pairId] = {};
      return {
        pair: rewritePairs.find((p) => p.id === pairId)!,
        outputs: order.map((model, j) => {
          const label = String.fromCharCode(65 + j);
          key[pairId]![label] = model;
          const r = rows.find((x) => x.pairId === pairId && x.model === model);
          return {
            label,
            output: (r?.output as never) ?? null,
            error: r?.error ?? null,
            metrics: r?.metrics ?? null,
          };
        }),
      };
    });
    writeFileSync(resolve(outDir, 'key.json'), JSON.stringify({ seed, key }, null, 2));
    writeFileSync(
      resolve(outDir, 'report.html'),
      renderBlindReport({ task, createdAt, pairs: blind }),
    );
  }

  console.table(
    summary.map(({ model, jsonValid, runs, latencyP50Ms, ...rest }) => ({
      model,
      valid: `${jsonValid}/${runs}`,
      p50: latencyP50Ms,
      ...('factGuardViolations' in rest
        ? { fg: rest.factGuardViolations, must: rest.mustHaveCoverage }
        : {}),
    })),
  );
  console.log(`eval: wrote ${outDir}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
