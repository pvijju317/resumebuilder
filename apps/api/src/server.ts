import { Redis } from 'ioredis';
import { createPrisma } from '@tailor/db';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { RedisHitCounter } from './lib/hits.js';
import { createLogger } from './lib/logger.js';
import { createGoogleVerifier } from './routes/auth.routes.js';
import { createMailer } from './services/mailer.js';
import { createBullQueue } from './services/queue.js';
import { createStorage, DiskStorage } from './services/storage.js';
import { createTurnstile } from './services/turnstile.js';
import type { AnonService } from './services/anon.service.js';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrisma(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
redis.on('error', (err) => logger.error({ err }, 'redis error'));
// BullMQ needs its own connection with maxRetriesPerRequest: null.
const queueRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = createBullQueue(queueRedis);
const storage = createStorage(env);
if (!storage)
  logger.warn('S3/R2 storage not configured: file uploads disabled, pasted text still works');
if (storage instanceof DiskStorage) {
  logger.warn(`dev disk storage in use; uploads are deleted after ${env.FILE_RETENTION_HOURS} h`);
  const sweep = () =>
    storage.sweep(env.FILE_RETENTION_HOURS * 3_600_000).then(
      (n) => n && logger.info(`deleted ${n} expired uploads`),
      (err) => logger.warn({ err }, 'upload sweep failed'),
    );
  void sweep();
  setInterval(() => void sweep(), 3_600_000).unref();
}

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

// Anonymous sessions, their jobs and uploads expire (PRD F1: 72 h).
const anon = app.locals['anon'] as AnonService;
setInterval(() => {
  anon.cleanupExpired().then(
    (n) => n && logger.info(`removed ${n} expired anonymous sessions`),
    (err) => logger.warn({ err }, 'anonymous cleanup failed'),
  );
}, 3_600_000).unref();

const port = Number(new URL(env.API_URL).port || 4000);
const server = app.listen(port, () => logger.info(`api listening on :${port}`));

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), queue.close(), redis.quit(), queueRedis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
