import { config } from 'dotenv';
import { resolve } from 'node:path';
import { jdHash } from '@tailor/core/ats';
import { createPrisma } from '@tailor/db';
import { AppError } from '@tailor/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JD_FAILED_MESSAGE, runJdExtract } from '../src/jd.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
const prisma = createPrisma(process.env['DATABASE_URL_TEST']!);
beforeEach(async () => {
  const t = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${t.map((x) => `"${x.tablename}"`).join(', ')} CASCADE`);
});
afterAll(() => prisma.$disconnect());

const TEXT = 'Data Analyst at Fabrikam. Requirements: SQL, Python, Tableau. '.repeat(5);
const OUT = {
  title: 'Data Analyst',
  company: 'Fabrikam',
  seniority: 'mid',
  mustHave: [{ name: 'SQL', aliases: [] }],
  niceToHave: [],
  responsibilities: [],
  keywords: [],
  education: [],
};
const pending = (sourceUrl: string | null = null) =>
  prisma.job.create({ data: { status: 'pending', rawText: TEXT, source: 'paste', sourceUrl } });

describe('runJdExtract', () => {
  it('extracts once into the shared cache and attaches the job', async () => {
    const job = await pending('https://jobs.example.com/1');
    const run = vi.fn(async () => ({ output: OUT, model: 'nvidia/nemotron-3-super-120b-a12b' }));
    expect(await runJdExtract({ prisma, ai: { run } as never }, job.id, vi.fn(), false)).toEqual({
      status: 'ready',
      cached: false,
    });
    const saved = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { jdCache: true },
    });
    expect(saved).toMatchObject({
      status: 'ready',
      rawText: null,
      jdCache: {
        hash: jdHash(TEXT),
        urlNorm: 'https://jobs.example.com/1',
        model: 'nvidia/nemotron-3-super-120b-a12b',
      },
    });
    expect(await runJdExtract({ prisma, ai: { run } as never }, job.id, vi.fn(), false)).toEqual({
      skipped: true,
    });
  });

  it('uses a cache entry created meanwhile and tolerates a taken URL', async () => {
    const run = vi.fn(async () => ({ output: OUT, model: 'm' }));
    const a = await pending();
    await prisma.jdCache.create({
      data: { hash: jdHash(TEXT), raw: TEXT, extracted: OUT, model: 'm' },
    });
    expect(await runJdExtract({ prisma, ai: { run } as never }, a.id, vi.fn(), false)).toEqual({
      status: 'ready',
      cached: true,
    });
    expect(run).not.toHaveBeenCalled();

    await prisma.jdCache.deleteMany();
    await prisma.jdCache.create({
      data: {
        hash: 'other',
        urlNorm: 'https://jobs.example.com/2',
        raw: 'x',
        extracted: OUT,
        model: 'm',
      },
    });
    const b = await pending('https://jobs.example.com/2');
    expect(
      (await runJdExtract({ prisma, ai: { run } as never }, b.id, vi.fn(), false)).status,
    ).toBe('ready');
    expect(
      (await prisma.jdCache.findUniqueOrThrow({ where: { hash: jdHash(TEXT) } })).urlNorm,
    ).toBeNull();
  });

  it('requeues once on high demand, then fails with a friendly message', async () => {
    const job = await pending();
    const busy = {
      run: vi.fn(async () => Promise.reject(new AppError('AI_UNAVAILABLE', 'busy', 503))),
    };
    const requeue = vi.fn(async () => undefined);
    expect(await runJdExtract({ prisma, ai: busy as never }, job.id, requeue, false)).toEqual({
      status: 'requeued',
    });
    expect(requeue).toHaveBeenCalledWith(30_000);
    expect((await runJdExtract({ prisma, ai: busy as never }, job.id, requeue, true)).status).toBe(
      'failed',
    );
    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'failed',
      error: JD_FAILED_MESSAGE,
    });
  });
});
