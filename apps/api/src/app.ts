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
  /** Readiness probes for /health/ready. */
  checks?: Record<string, () => Promise<unknown>>;
}

export function createApp(deps: AppDeps) {
  const { env, prisma, hits, mailer, logger, google } = deps;
  const signer = createTokenSigner(env);
  const auth = createAuthService({ prisma, env, mailer, signer, hits });
  const me = createMeService(prisma);
  const plans = createPlansService(prisma);

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

  app.use('/api/v1', v1);
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
