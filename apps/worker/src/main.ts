import { config } from 'dotenv';
import { resolve } from 'node:path';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { AiClient, RedisRateLimiter } from '@tailor/ai';
import { createPrisma } from '@tailor/db';
import { ServerEnv, parseEnv } from '@tailor/shared/env';
import { PrismaCallLogSink } from './call-log-sink.js';
import { PRIORITY, QUEUES, processAiJob, type AiJobData } from './queues.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
const env = parseEnv(ServerEnv, process.env);
const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});

const prisma = createPrisma(env.DATABASE_URL);
// BullMQ requires maxRetriesPerRequest: null on its blocking connection.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const limiterRedis = new Redis(env.REDIS_URL);

const ai = new AiClient({
  env,
  limiter: new RedisRateLimiter(limiterRedis, { rpm: env.AI_RPM_LIMIT, burst: env.AI_RPM_BURST }),
  sink: new PrismaCallLogSink(prisma, (e) =>
    logger.debug({ task: e.task, debug: e.debug }, 'ai call body (AI_DEBUG_LOG)'),
  ),
});

const aiQueue = new Queue<AiJobData>(QUEUES.ai, { connection });
const worker = new Worker<AiJobData>(
  QUEUES.ai,
  (job) =>
    processAiJob(ai, job.data, async (data, delay) => {
      await aiQueue.add(job.name, data, { delay, priority: job.opts.priority ?? PRIORITY.normal });
    }),
  // Concurrency only bounds in-flight jobs; the shared limiter enforces AI_RPM_LIMIT globally.
  { connection, concurrency: 8 },
);

worker.on('failed', (job, err) =>
  logger.warn({ jobId: job?.id, task: job?.data.task, err: err.message }, 'ai job failed'),
);
worker.on('ready', () =>
  logger.info(`worker ready (rpm ${env.AI_RPM_LIMIT}, burst ${env.AI_RPM_BURST})`),
);

async function shutdown(signal: string) {
  logger.info(`${signal} received, draining`);
  await worker.close();
  await aiQueue.close();
  await Promise.allSettled([prisma.$disconnect(), connection.quit(), limiterRedis.quit()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
