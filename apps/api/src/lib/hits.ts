import type { Redis } from 'ioredis';

/** Fixed-window hit counter used for HTTP rate limits (TRD §10). */
export interface HitCounter {
  /** Records a hit and returns the count in the current window. */
  hit(key: string, windowMs: number): Promise<number>;
}

export class RedisHitCounter implements HitCounter {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number): Promise<number> {
    const k = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const [[, count]] = (await this.redis.multi().incr(k).pexpire(k, windowMs).exec()) as [
      [Error | null, number],
      [Error | null, number],
    ];
    return count;
  }
}

export class MemoryHitCounter implements HitCounter {
  private counts = new Map<string, number>();

  async hit(key: string, windowMs: number): Promise<number> {
    const k = `${key}:${Math.floor(Date.now() / windowMs)}`;
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
}
