import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { PrismaClient } from '@tailor/db';
import type { ServerEnv } from '@tailor/shared/env';
import { randomUUID } from 'node:crypto';
import type { HitCounter } from './lib/hits.js';
import { errorHandler, notFound } from './lib/http.js';
import { requireAuth } from './middleware/auth.js';
import { rateLimit } from './middleware/rate-limit.js';
import { authRoutes, type GoogleVerifier } from './routes/auth.routes.js';
import { meRoutes } from './routes/me.routes.js';
import { filesRoutes, vaultRoutes } from './routes/vault.routes.js';
import { createFilesService } from './services/files.service.js';
import { createImportsService } from './services/imports.service.js';
import type { JobQueue } from './services/queue.js';
import { DiskStorage, type Storage } from './services/storage.js';
import { AppError } from '@tailor/shared';
import { createVaultService } from './services/vault.service.js';
import { createAuthService } from './services/auth.service.js';
import type { Mailer } from './services/mailer.js';
import { createMeService } from './services/me.service.js';
import { createPlansService } from './services/plans.service.js';
import { createTokenSigner } from './services/tokens.js';

export interface AppDeps {
  env: ServerEnv;
  prisma: PrismaClient;
  hits: HitCounter;
  mailer: Mailer;
  logger: Logger;
  google: GoogleVerifier | null;
  storage: Storage | null;
  queue: JobQueue;
  /** Readiness probes for /health/ready. */
  checks?: Record<string, () => Promise<unknown>>;
}

export function createApp(deps: AppDeps) {
  const { env, prisma, hits, mailer, logger, google } = deps;
  const signer = createTokenSigner(env);
  const auth = createAuthService({ prisma, env, mailer, signer, hits });
  const me = createMeService(prisma);
  const plans = createPlansService(prisma);
  const files = createFilesService({ prisma, env, storage: deps.storage });
  const imports = createImportsService({ prisma, files, queue: deps.queue });
  const vault = createVaultService({ prisma, queue: deps.queue });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Method, path and status only: no bodies, no query strings (may carry tokens/PII).
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ status: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const v1 = express.Router();
  v1.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  v1.get('/health/ready', async (_req, res) => {
    const results: Record<string, boolean> = {};
    for (const [name, check] of Object.entries(deps.checks ?? {})) {
      results[name] = await check().then(
        () => true,
        () => false,
      );
    }
    const ok = Object.values(results).every(Boolean);
    res.status(ok ? 200 : 503).json({ ok, checks: results });
  });
  v1.use('/auth', authRoutes({ env, auth, hits, google }));
  // Dev-only disk storage: the signed token authorizes the upload (same flow as presigned R2/S3).
  if (deps.storage instanceof DiskStorage) {
    const disk = deps.storage;
    v1.put(
      '/files/upload/:token',
      express.raw({ type: () => true, limit: env.FILE_MAX_BYTES }),
      async (req, res) => {
        const p = disk.verify(req.params['token']!);
        const body = req.body as Buffer;
        if (
          req.get('content-type') !== p.mime ||
          !Buffer.isBuffer(body) ||
          body.byteLength !== p.size
        ) {
          throw new AppError('VALIDATION', 'Upload does not match the requested file.', 400);
        }
        await disk.write(p.key, body);
        res.status(200).end();
      },
    );
  }
  v1.get('/plans', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await plans.listPublic());
  });

  // Guard each authenticated resource explicitly so unknown paths still 404.
  const authed = [
    requireAuth(signer),
    rateLimit({
      hits,
      name: 'api',
      limit: env.API_RATE_LIMIT_PER_MIN,
      windowMs: 60_000,
      key: (req) => req.auth!.sub,
    }),
  ];
  v1.use('/me', ...authed, meRoutes(me));
  v1.use('/files', ...authed, filesRoutes(files));
  v1.use('/vault', ...authed, vaultRoutes({ env, hits, imports, vault }));

  app.use('/api/v1', v1);
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
