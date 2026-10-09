import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter, RateLimitTimeoutError, RedisRateLimiter } from '../src/rate-limiter.js';

describe('MemoryRateLimiter (virtual clock)', () => {
  it('admits a burst, then exactly rpm per minute', async () => {
    let now = 0;
    const grants: number[] = [];
    const rl = new MemoryRateLimiter(
      { rpm: 35, burst: 3 },
      () => now,
      async (ms) => void (now += ms),
    );
    await Promise.all(
      Array.from({ length: 40 }, () => rl.acquire('nvidia').then(() => grants.push(now))),
    );

    // Sliding 60 s windows never exceed rpm + burst.
    for (const start of grants) {
      const inWindow = grants.filter((t) => t >= start && t < start + 60_000).length;
      expect(inWindow).toBeLessThanOrEqual(35 + 3);
    }
    expect(grants.slice(0, 3)).toEqual([0, 0, 0]);
    // After the burst, spacing is 60 000 / 35 ≈ 1715 ms.
    expect(grants[3]).toBeGreaterThanOrEqual(1714);
    expect(grants[39]! - grants[3]!).toBeGreaterThanOrEqual(36 * 1714);
  });

  it('keeps separate buckets per key', async () => {
    let now = 0;
    const rl = new MemoryRateLimiter(
      { rpm: 60, burst: 1 },
      () => now,
      async (ms) => void (now += ms),
    );
    await rl.acquire('a');
    await rl.acquire('b');
    expect(now).toBe(0);
  });
});

// Integration: proves the shared Redis bucket throttles concurrent callers across clients
// (simulating several API/worker processes). Requires REDIS_URL (docker compose up -d).
const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const probe = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
probe.on('error', () => undefined);
const redisUp = await probe.connect().then(
  () => true,
  () => false,
);

describe.skipIf(!redisUp)('RedisRateLimiter (real Redis)', () => {
  const clients: Redis[] = [];
  const key = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(() => {
    for (let i = 0; i < 3; i++) clients.push(new Redis(REDIS_URL));
  });
  afterAll(async () => {
    await Promise.all(clients.map((c) => c.quit()));
    await probe.quit();
  });

  it('limits 3 independent clients sharing one bucket to rpm + burst', async () => {
    // 600 rpm = one slot / 100 ms; burst 2. 12 requests need ≥ (12 - 2) × 100 ms ≈ 1 s.
    const cfg = { rpm: 600, burst: 2 };
    const limiters = clients.map((c) => new RedisRateLimiter(c, cfg, 'test:rl:'));
    const started = Date.now();
    const grants: number[] = [];
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        limiters[i % 3]!.acquire(key).then(() => grants.push(Date.now() - started)),
      ),
    );
    grants.sort((a, b) => a - b);
    expect(grants[11]).toBeGreaterThanOrEqual(950);
    // No 1 s window admits more than rpm/60 + burst = 12 grants; check the tighter 500 ms window.
    for (const t of grants) {
      expect(grants.filter((g) => g >= t && g < t + 500).length).toBeLessThanOrEqual(5 + 2);
    }
  });

  it('gives up after maxWaitMs', async () => {
    const rl = new RedisRateLimiter(clients[0]!, { rpm: 1, burst: 1, maxWaitMs: 50 }, 'test:rl:');
    await rl.acquire(`${key}-timeout`);
    await expect(rl.acquire(`${key}-timeout`)).rejects.toBeInstanceOf(RateLimitTimeoutError);
  });
});
