import { createPrisma, type PrismaClient } from '@tailor/db';
import supertest from 'supertest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { MemoryHitCounter } from '../src/lib/hits.js';
import { createLogger } from '../src/lib/logger.js';
import type { GoogleVerifier } from '../src/routes/auth.routes.js';
import type { Mail, Mailer } from '../src/services/mailer.js';
import { MemoryQueue } from '../src/services/queue.js';
import { MemoryStorage, type Storage } from '../src/services/storage.js';

export function testEnv(over: Record<string, string> = {}) {
  return loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env['DATABASE_URL_TEST'],
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    ...over,
  });
}

let prisma: PrismaClient | null = null;
export function db(): PrismaClient {
  prisma ??= createPrisma(process.env['DATABASE_URL_TEST']!);
  return prisma;
}

export async function resetDb() {
  const tables = await db().$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db().$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
}

export function makeApp(
  opts: {
    env?: Record<string, string>;
    google?: GoogleVerifier | null;
    storage?: Storage;
    fetchJobText?: (url: string) => Promise<string>;
  } = {},
) {
  const env = testEnv(opts.env);
  const outbox: Mail[] = [];
  const mailer: Mailer = { send: async (m) => void outbox.push(m) };
  const storage = opts.storage ?? new MemoryStorage();
  const queue = new MemoryQueue();
  const app = createApp({
    env,
    prisma: db(),
    hits: new MemoryHitCounter(),
    mailer,
    logger: createLogger(env),
    google: opts.google ?? null,
    storage,
    queue,
    human: { verify: async (token: string) => token !== 'fail' },
    fetchJobText:
      opts.fetchJobText ??
      (async () => {
        throw new Error('network disabled in tests');
      }),
  });
  const lastCode = (to: string) => {
    const mail = [...outbox].reverse().find((m) => m.to === to);
    return /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1] ?? null;
  };
  return {
    app,
    req: supertest(app),
    outbox,
    lastCode,
    env,
    storage: storage as MemoryStorage,
    queue,
  };
}

export function refreshCookie(res: { headers: Record<string, unknown> }): string | null {
  const set = res.headers['set-cookie'] as string[] | undefined;
  const c = set?.find((s) => s.startsWith('tailor_rt='));
  return c ? c.split(';')[0]! : null;
}

export async function signIn(h: ReturnType<typeof makeApp>, email = 'asha@example.com') {
  await h.req.post('/api/v1/auth/otp/request').send({ email }).expect(204);
  const res = await h.req
    .post('/api/v1/auth/otp/verify')
    .send({ email, code: h.lastCode(email) })
    .expect(200);
  return { accessToken: res.body.accessToken as string, cookie: refreshCookie(res)! };
}
