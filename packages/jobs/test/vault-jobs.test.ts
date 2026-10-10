import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createPrisma } from '@tailor/db';
import { AppError, type VaultDraft } from '@tailor/shared';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARSE_FAILED_MESSAGE,
  fillContacts,
  runGapQuestions,
  runVaultParse,
} from '../src/vault.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });
const prisma = createPrisma(process.env['DATABASE_URL_TEST']!);

beforeEach(async () => {
  const tables = await prisma.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
});
afterAll(() => prisma.$disconnect());

const RESUME = `Asha Rao
asha.rao@example.com | +91 98450 12345 | linkedin.com/in/asha-rao
Senior Data Analyst, Contoso Retail, 2021-03 to present
- Automated reporting in Python, cutting effort by 63%`;

const parsed = (over: Partial<VaultDraft['profile']> = {}): VaultDraft => ({
  profile: { name: 'Asha Rao', email: '{{EMAIL_1}}', phone: null, links: [], ...over },
  roles: [
    {
      company: 'Contoso Retail',
      title: 'Senior Data Analyst',
      startDate: '2021-03',
      endDate: null,
      achievements: [
        {
          text: 'Automated reporting in Python, cutting effort by 63%',
          metrics: [{ value: 63, unit: '%', context: 'effort' }],
          skills: ['Python'],
          impactType: ['time'],
          confidence: 1,
        },
      ],
      confidence: 1,
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  skills: [],
  extras: { languages: [], awards: [], publications: [], volunteering: [] },
});

async function anImport() {
  const user = await prisma.user.create({
    data: { email: 'asha@example.com', consentAt: new Date() },
  });
  const row = await prisma.vaultImport.create({
    data: { userId: user.id, source: 'text', text: RESUME, status: 'queued' },
  });
  return { user, row };
}

describe('runVaultParse', () => {
  it('sends tokenized text to the AI, restores PII and fills contacts deterministically', async () => {
    const { row } = await anImport();
    const run = vi.fn(async () => ({
      output: parsed(),
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
    }));
    const r = await runVaultParse({ prisma, ai: { run } as never }, row.id, vi.fn(), false);
    expect(r).toEqual({ status: 'ready' });

    const sent = (run.mock.calls[0] as unknown as [string, { text: string }])[1].text;
    expect(sent).not.toMatch(/asha\.rao@example\.com|98450|linkedin\.com/);
    expect(sent).toContain('{{EMAIL_1}}');

    const saved = await prisma.vaultImport.findUniqueOrThrow({ where: { id: row.id } });
    expect(saved).toMatchObject({
      status: 'ready',
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      error: null,
    });
    const draft = saved.draft as VaultDraft;
    expect(draft.profile).toMatchObject({
      email: 'asha.rao@example.com',
      phone: '+91 98450 12345',
      links: [{ kind: 'linkedin', url: 'linkedin.com/in/asha-rao' }],
    });

    // Idempotent: a duplicate delivery does nothing.
    expect(await runVaultParse({ prisma, ai: { run } as never }, row.id, vi.fn(), false)).toEqual({
      skipped: true,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('requeues once on high demand, then fails with a friendly message', async () => {
    const { row } = await anImport();
    const busy = {
      run: vi.fn(async () => Promise.reject(new AppError('AI_UNAVAILABLE', 'High demand', 503))),
    };
    const requeue = vi.fn(async () => undefined);
    expect(await runVaultParse({ prisma, ai: busy as never }, row.id, requeue, false)).toEqual({
      status: 'requeued',
    });
    expect(requeue).toHaveBeenCalledWith(30_000);
    expect((await prisma.vaultImport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      'queued',
    );

    const r = await runVaultParse({ prisma, ai: busy as never }, row.id, requeue, true);
    expect(r.status).toBe('failed');
    expect(await prisma.vaultImport.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      status: 'failed',
      error: PARSE_FAILED_MESSAGE,
    });
  });

  it('fails cleanly on invalid AI output and ignores unknown imports', async () => {
    const { row } = await anImport();
    const bad = {
      run: vi.fn(async () => ({ output: { profile: {}, roles: [{ company: '' }] }, model: 'm' })),
    };
    expect((await runVaultParse({ prisma, ai: bad as never }, row.id, vi.fn(), false)).status).toBe(
      'failed',
    );
    expect(await runVaultParse({ prisma, ai: bad as never }, 'missing', vi.fn(), false)).toEqual({
      skipped: true,
    });
  });
});

describe('fillContacts', () => {
  it('keeps values the model returned and classifies links', () => {
    const d = fillContacts(
      parsed({ email: 'kept@example.com', links: [{ kind: 'other', url: 'https://x.dev' }] }),
      {
        '{{EMAIL_1}}': 'other@example.com',
        '{{URL_1}}': 'https://x.dev',
        '{{URL_2}}': 'github.com/a',
        '{{URL_3}}': 'https://a.example.com',
      },
    );
    expect(d.profile.email).toBe('kept@example.com');
    expect(d.profile.links.map((l) => l.kind)).toEqual(['other', 'github', 'portfolio']);
  });
});

describe('runGapQuestions', () => {
  async function vaultWith() {
    const user = await prisma.user.create({ data: { email: 'g@example.com' } });
    const vault = await prisma.vault.create({
      data: { userId: user.id, profile: { name: 'G', links: [] } },
    });
    const role = await prisma.vaultRole.create({
      data: {
        vaultId: vault.id,
        company: 'Contoso',
        title: 'Analyst',
        startDate: '2022-01',
        order: 0,
        achievements: {
          create: [
            {
              text: 'Built dashboards for managers; contact me at g@example.com',
              metrics: [],
              skills: [],
              impactType: [],
              source: 'parse',
              order: 0,
            },
            {
              text: 'Cut costs by 12%',
              metrics: [{ value: 12, unit: '%', context: 'cost' }],
              skills: [],
              impactType: [],
              source: 'parse',
              order: 1,
            },
            {
              text: 'Ran weekly reviews',
              metrics: [],
              skills: [],
              impactType: [],
              source: 'parse',
              order: 2,
            },
          ],
        },
      },
      include: { achievements: true },
    });
    return { user, vault, ach: role.achievements };
  }

  it('asks only about unquantified achievements and drops invalid or duplicate ids', async () => {
    const { user, vault, ach } = await vaultWith();
    await prisma.vaultGapQuestion.create({
      data: { vaultId: vault.id, achievementId: ach[0]!.id, question: 'stale', status: 'open' },
    });
    await prisma.vaultGapQuestion.create({
      data: {
        vaultId: vault.id,
        achievementId: ach[2]!.id,
        question: 'kept history',
        status: 'answered',
      },
    });
    const run = vi.fn(async () => ({
      output: {
        questions: [
          {
            achievementId: ach[0]!.id,
            question: 'How many managers used them?',
            expectedUnit: 'managers',
          },
          { achievementId: ach[0]!.id, question: 'Duplicate question for the same item?' },
          { achievementId: ach[1]!.id, question: 'Already quantified, should be dropped?' },
          { achievementId: 'invented-id', question: 'Not a real achievement id?' },
          { achievementId: ach[2]!.id, question: 'How many people attended?' },
        ],
      },
      model: 'm',
    }));
    await prisma.vault.update({
      where: { id: vault.id },
      data: { gapQuestionsRequestedAt: new Date() },
    });
    expect(
      await runGapQuestions(
        { prisma, ai: { run } as never },
        { vaultId: vault.id, userId: user.id },
      ),
    ).toEqual({ created: 2 });
    expect(
      (await prisma.vault.findUniqueOrThrow({ where: { id: vault.id } })).gapQuestionsRequestedAt,
    ).toBeNull();

    const sent = (
      run.mock.calls[0] as unknown as [string, { achievements: { id: string; text: string }[] }]
    )[1].achievements;
    expect(sent.map((a) => a.id)).toEqual([ach[0]!.id, ach[2]!.id]);
    expect(sent[0]!.text).not.toContain('g@example.com');

    const qs = await prisma.vaultGapQuestion.findMany({
      where: { vaultId: vault.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(qs.map((q) => [q.status, q.question])).toEqual([
      ['answered', 'kept history'],
      ['open', 'How many managers used them?'],
      ['open', 'How many people attended?'],
    ]);
  });

  it('stops the pending flag even when the AI call fails', async () => {
    const { user, vault } = await vaultWith();
    await prisma.vault.update({
      where: { id: vault.id },
      data: { gapQuestionsRequestedAt: new Date() },
    });
    const run = vi.fn(async () => Promise.reject(new Error('down')));
    await expect(
      runGapQuestions({ prisma, ai: { run } as never }, { vaultId: vault.id, userId: user.id }),
    ).rejects.toThrow('down');
    expect(
      (await prisma.vault.findUniqueOrThrow({ where: { id: vault.id } })).gapQuestionsRequestedAt,
    ).toBeNull();
  });

  it('clears open questions when nothing is left to quantify', async () => {
    const { user, vault, ach } = await vaultWith();
    for (const a of ach)
      await prisma.vaultAchievement.update({
        where: { id: a.id },
        data: { metrics: [{ value: 1, unit: 'x', context: 'c' }] },
      });
    await prisma.vaultGapQuestion.create({
      data: { vaultId: vault.id, achievementId: ach[0]!.id, question: 'old' },
    });
    const run = vi.fn();
    expect(
      await runGapQuestions(
        { prisma, ai: { run } as never },
        { vaultId: vault.id, userId: user.id },
      ),
    ).toEqual({ created: 0 });
    expect(run).not.toHaveBeenCalled();
    expect(await prisma.vaultGapQuestion.count({ where: { vaultId: vault.id } })).toBe(0);
    expect(
      await runGapQuestions(
        { prisma, ai: { run } as never },
        { vaultId: 'missing', userId: user.id },
      ),
    ).toEqual({ created: 0 });
  });
});
