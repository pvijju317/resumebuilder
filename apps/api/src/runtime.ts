import { AiClient, RedisRateLimiter } from '@tailor/ai';
import { createPrisma } from '@tailor/db';
import { PrismaCallLogSink, runBackgroundJob } from '@tailor/jobs';
import type { ServerEnv } from '@tailor/shared/env';
import { Redis } from 'ioredis';
import { createApp } from './app.js';
import { RedisHitCounter } from './lib/hits.js';
import { createLogger } from './lib/logger.js';
import { createGoogleVerifier } from './routes/auth.routes.js';
import { createMailer } from './services/mailer.js';
import { createBullQueue, InlineQueue, type JobQueue } from './services/queue.js';
import { createStorage } from './services/storage.js';
import { createTurnstile } from './services/turnstile.js';

/**
 * Wire the API for a host. `schedule` hands background promises to the platform (Vercel
 * `waitUntil`); on a long-running server they simply run.
 */
export function buildRuntime(
  env: ServerEnv,
  opts: { schedule?: (p: Promise<unknown>) => void } = {},
) {
  const logger = createLogger(env);
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  redis.on('error', (err) => logger.error({ err }, 'redis error'));

  let queue: JobQueue & { close?: () => Promise<void> };
  let queueRedis: Redis | null = null;
  if (env.QUEUE_DRIVER === 'inline') {
    const ai = new AiClient({
      env,
      limiter: new RedisRateLimiter(redis, { rpm: env.AI_RPM_LIMIT, burst: env.AI_RPM_BURST }),
      sink: new PrismaCallLogSink(prisma),
    });
    queue = new InlineQueue(
      (name, data, requeue) => runBackgroundJob({ prisma, ai }, name, data, requeue),
      opts.schedule ?? ((p) => void p),
      (err, job) => logger.error({ err, job }, 'inline job failed'),
    );
  } else {
    // BullMQ needs its own connection with maxRetriesPerRequest: null.
    queueRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queue = createBullQueue(queueRedis);
  }

  const storage = createStorage(env, prisma);
  if (!storage)
    logger.warn('object storage not configured: file uploads disabled, pasted text still works');

  const app = createApp({
    env,
    prisma,
    hits: new RedisHitCounter(redis),
    mailer: createMailer(env, logger),
    logger,
    google: createGoogleVerifier(env),
    storage,
    queue,
    human: createTurnstile(env),
    checks: { db: () => prisma.$queryRaw`SELECT 1`, redis: () => redis.ping() },
  });

  const close = async () => {
    await Promise.allSettled([
      prisma.$disconnect(),
      queue.close?.(),
      redis.quit(),
      queueRedis?.quit(),
    ]);
  };
  return { app, logger, prisma, storage, close };
}
