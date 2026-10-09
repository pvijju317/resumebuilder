import type { Redis } from 'ioredis';

/**
 * Global AI rate limiter (TRD §5.3): a token bucket per provider key, shared by every API/worker
 * process through Redis. Capacity = `burst`, refill = `rpm` per minute, so any 60 s window admits
 * at most `rpm + burst` calls.
 */
export interface RateLimiter {
  /** Resolves once a request slot is available. */
  acquire(key: string): Promise<void>;
}

export interface BucketConfig {
  rpm: number;
  burst: number;
  /** Max total wait before giving up (ms). */
  maxWaitMs?: number;
}

export class RateLimitTimeoutError extends Error {
  constructor(key: string, waitedMs: number) {
    super(`Rate limiter "${key}" wait exceeded ${waitedMs}ms`);
    this.name = 'RateLimitTimeoutError';
  }
}

// Atomic take-or-report-wait. Uses the Redis server clock so all processes agree on time.
const TAKE_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
tokens = math.min(capacity, tokens + math.max(0, now - ts) * refill_per_ms)
local wait = 0
if tokens >= 1 then
  tokens = tokens - 1
else
  wait = math.ceil((1 - tokens) / refill_per_ms)
end
redis.call('HSET', key, 'tokens', tostring(tokens), 'ts', tostring(now))
redis.call('PEXPIRE', key, math.ceil(capacity / refill_per_ms) + 60000)
return wait
`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly cfg: BucketConfig,
    private readonly prefix = 'ai:rl:',
  ) {}

  async acquire(key: string): Promise<void> {
    const refillPerMs = this.cfg.rpm / 60_000;
    const maxWait = this.cfg.maxWaitMs ?? 120_000;
    const started = Date.now();
    for (;;) {
      const wait = Number(
        await this.redis.eval(TAKE_LUA, 1, this.prefix + key, this.cfg.burst, refillPerMs),
      );
      if (wait === 0) return;
      if (Date.now() - started + wait > maxWait) {
        throw new RateLimitTimeoutError(key, maxWait);
      }
      // Small jitter so waiting processes don't stampede the same instant.
      await sleep(wait + Math.floor(Math.random() * 25));
    }
  }
}

/** Single-process limiter for tests and the eval CLI when Redis is unavailable. */
export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { tokens: number; ts: number }>();
  private queue = new Map<string, Promise<void>>();

  constructor(
    private readonly cfg: BucketConfig,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  acquire(key: string): Promise<void> {
    // Serialize per key so concurrent callers are granted in FIFO order.
    const prev = this.queue.get(key) ?? Promise.resolve();
    const next = prev.then(() => this.take(key));
    this.queue.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private async take(key: string): Promise<void> {
    const refillPerMs = this.cfg.rpm / 60_000;
    for (;;) {
      const t = this.now();
      const b = this.buckets.get(key) ?? { tokens: this.cfg.burst, ts: t };
      b.tokens = Math.min(this.cfg.burst, b.tokens + Math.max(0, t - b.ts) * refillPerMs);
      b.ts = t;
      this.buckets.set(key, b);
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return;
      }
      await this.wait(Math.ceil((1 - b.tokens) / refillPerMs));
    }
  }
}
