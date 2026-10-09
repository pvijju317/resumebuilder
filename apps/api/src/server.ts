import type { AnonService } from './services/anon.service.js';
import { loadEnv } from './env.js';
import { buildRuntime } from './runtime.js';
import { SignedUploadStorage } from './services/storage.js';

const env = loadEnv();
const { app, logger, storage, close } = buildRuntime(env);

// Long-running hosts do their own housekeeping; serverless hosts use the cron endpoint.
const anon = app.locals['anon'] as AnonService;
const housekeeping = () => {
  anon.cleanupExpired().then(
    (n) => n && logger.info(`removed ${n} expired anonymous sessions`),
    (err) => logger.warn({ err }, 'anonymous cleanup failed'),
  );
  if (storage instanceof SignedUploadStorage) {
    storage.sweep(env.FILE_RETENTION_HOURS * 3_600_000).then(
      (n) => n && logger.info(`deleted ${n} expired uploads`),
      (err) => logger.warn({ err }, 'upload sweep failed'),
    );
  }
};
housekeeping();
setInterval(housekeeping, 3_600_000).unref();

const port = Number(new URL(env.API_URL).port || 4000);
const server = app.listen(port, () => logger.info(`api listening on :${port}`));

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
