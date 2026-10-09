import { Redis } from 'ioredis';
import { createPrisma } from '@tailor/db';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { RedisHitCounter } from './lib/hits.js';
import { createLogger } from './lib/logger.js';
import { createGoogleVerifier } from './routes/auth.routes.js';
import { createMailer } from './services/mailer.js';

const env = loadEnv();
const logger = createLogger(env);
const prisma = createPrisma(env.DATABASE_URL);
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
redis.on('error', (err) => logger.error({ err }, 'redis error'));

const app = createApp({
  env,
  prisma,
  hits: new RedisHitCounter(redis),
  mailer: createMailer(env, logger),
  logger,
  google: createGoogleVerifier(env),
  checks: { db: () => prisma.$queryRaw`SELECT 1`, redis: () => redis.ping() },
});

const port = Number(new URL(env.API_URL).port || 4000);
const server = app.listen(port, () => logger.info(`api listening on :${port}`));

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
