import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { VaultDraft, VaultDto } from '@tailor/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, makeApp, resetDb, signIn } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

const RESUME_TEXT = readFileSync(
  resolve(import.meta.dirname, '../../../evals/resumes/files/r08-finance-txt.txt'),
  'utf8',
);

const draft: VaultDraft = {
  profile: {
    name: 'Neha Kulkarni',
    email: 'neha@example.com',
    phone: '+91 98220 66778',
    location: 'Mumbai',
    headline: 'Financial Analyst',
    links: [],
  },
  roles: [
    {
      company: 'Woodgrove Bank',
      title: 'Financial Analyst',
      location: 'Mumbai',
      startDate: '2022-07',
      endDate: null,
      achievements: [
        {
          text: 'Owned monthly variance analysis for a ₹900 Cr cost base',
          metrics: [{ value: 9_000_000_000, unit: 'INR', context: 'cost base' }],
          skills: ['FP&A'],
          impactType: ['cost'],
          confidence: 1,
        },
        {
          text: 'Built a rolling forecast model in Excel',
          metrics: [],
          skills: ['Excel'],
          impactType: [],
          confidence: 0.9,
        },
      ],
      confidence: 1,
    },
    {
      company: 'Northwind Capital',
      title: 'Finance Associate',
      startDate: '2020-08',
      endDate: '2022-06',
      achievements: [
        {
          text: 'Prepared quarterly board packs',
          metrics: [],
          skills: [],
          impactType: [],
          confidence: 1,
        },
      ],
      confidence: 1,
    },
  ],
  projects: [],
  education: [
    {
      institution: 'Contoso College of Commerce',
      degree: 'B.Com',
      startDate: '2017-06',
      endDate: '2020-05',
      confidence: 1,
    },
  ],
  certifications: [],
  skills: [{ name: 'Excel' }, { name: 'Power BI' }, { name: 'excel' }],
  extras: {
    languages: [{ name: 'Marathi', level: 'Native' }],
    awards: [],
    publications: [],
    volunteering: [],
  },
};

async function setup(consent = true) {
  const h = makeApp();
  const { accessToken } = await signIn(h);
  const auth = { authorization: `Bearer ${accessToken}` };
  if (consent) await h.req.patch('/api/v1/me').set(auth).send({ consent: true }).expect(200);
  return { h, auth };
}

/** Stand-in for the worker: mark the import ready with a parsed draft. */
async function workerParses(importId: string, d: VaultDraft = draft) {
  await db().vaultImport.update({
    where: { id: importId },
    data: { status: 'ready', draft: d, model: 'test' },
  });
}

async function buildAndConfirm(
  h: Awaited<ReturnType<typeof setup>>['h'],
  auth: Record<string, string>,
) {
  const built = await h.req
    .post('/api/v1/vault/build')
    .set(auth)
    .send({ text: RESUME_TEXT })
    .expect(202);
  await workerParses(built.body.id);
  await h.req
    .post(`/api/v1/vault/imports/${built.body.id}/confirm`)
    .set(auth)
    .send({ draft })
    .expect(200);
  return (await h.req.get('/api/v1/vault').set(auth).expect(200)).body as VaultDto;
}

describe('vault build → review → confirm', () => {
  it('requires AI-processing consent before any build', async () => {
    const { h, auth } = await setup(false);
    const r = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ text: RESUME_TEXT })
      .expect(403);
    expect(r.body.error.code).toBe('CONSENT_REQUIRED');
    expect(h.queue.jobs).toEqual([]);
  });

  it('queues a parse job for pasted text and exposes the import status', async () => {
    const { h, auth } = await setup();
    await h.req.get('/api/v1/vault').set(auth).expect(404);
    const built = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ text: RESUME_TEXT })
      .expect(202);
    expect(built.body).toMatchObject({ status: 'queued', draft: null });
    expect(h.queue.jobs).toEqual([{ name: 'vault.parse', data: { importId: built.body.id } }]);
    expect((await h.req.get('/api/v1/vault/imports/latest').set(auth)).body.id).toBe(built.body.id);

    await workerParses(built.body.id);
    const ready = await h.req.get(`/api/v1/vault/imports/${built.body.id}`).set(auth).expect(200);
    expect(ready.body).toMatchObject({ status: 'ready', duplicateRoleIndexes: [] });
    expect(ready.body.draft.roles).toHaveLength(2);
  });

  it('rejects short pasted text with a friendly message', async () => {
    const { h, auth } = await setup();
    const r = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ text: 'too short' })
      .expect(400);
    expect(r.body.error.code).toBe('VALIDATION');
  });

  it('confirms into a vault: confirmed items, normalized skills, strength, gap-question job', async () => {
    const { h, auth } = await setup();
    const v = await buildAndConfirm(h, auth);
    expect(v.roles.map((r) => [r.company, r.startDate, r.endDate])).toEqual([
      ['Woodgrove Bank', '2022-07', null],
      ['Northwind Capital', '2020-08', '2022-06'],
    ]);
    expect(v.roles[0]!.achievements[1]).toMatchObject({
      text: 'Built a rolling forecast model in Excel',
      confirmed: true,
      skills: ['microsoft excel'],
    });
    expect(v.skills.map((s) => s.key)).toEqual(['microsoft excel', 'power bi']);
    expect(v.extras.languages).toEqual([{ name: 'Marathi', level: 'Native' }]);
    expect(v.strength).toBeGreaterThan(40);
    expect(h.queue.jobs.at(-1)).toEqual({
      name: 'vault.gapQuestions',
      data: { vaultId: v.id, userId: expect.any(String) },
    });
    // The app polls until the worker has written the questions.
    expect(v.gapQuestionsPending).toBe(true);
  });

  it('flags duplicate roles on a second import and honours skips; never overwrites confirmed profile fields', async () => {
    const { h, auth } = await setup();
    await buildAndConfirm(h, auth);
    const second = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ text: RESUME_TEXT })
      .expect(202);
    const d2 = { ...draft, profile: { ...draft.profile, headline: 'Changed headline' } };
    await workerParses(second.body.id, d2);
    const review = await h.req.get(`/api/v1/vault/imports/${second.body.id}`).set(auth).expect(200);
    expect(review.body.duplicateRoleIndexes).toEqual([0, 1]);
    await h.req
      .post(`/api/v1/vault/imports/${second.body.id}/confirm`)
      .set(auth)
      .send({ draft: d2, skipRoleIndexes: [0, 1] })
      .expect(200);
    const v = (await h.req.get('/api/v1/vault').set(auth)).body as VaultDto;
    expect(v.roles).toHaveLength(2);
    expect(v.profile.headline).toBe('Financial Analyst');
    expect(v.education).toHaveLength(2);
    await h.req
      .post(`/api/v1/vault/imports/${second.body.id}/confirm`)
      .set(auth)
      .send({ draft: d2 })
      .expect(409);
  });

  it('keeps imports private to their owner', async () => {
    const a = await setup();
    const built = await a.h.req
      .post('/api/v1/vault/build')
      .set(a.auth)
      .send({ text: RESUME_TEXT })
      .expect(202);
    const { accessToken } = await signIn(a.h, 'other@example.com');
    await a.h.req
      .get(`/api/v1/vault/imports/${built.body.id}`)
      .set({ authorization: `Bearer ${accessToken}` })
      .expect(404);
  });
});

describe('uploads', () => {
  it('presigns, then extracts text from the uploaded object on build', async () => {
    const { h, auth } = await setup();
    const pdf = readFileSync(
      resolve(import.meta.dirname, '../../../evals/resumes/files/r02-data-analyst.pdf'),
    );
    const up = await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'cv.pdf', mime: 'application/pdf', size: pdf.byteLength })
      .expect(200);
    expect(up.body).toMatchObject({
      fileId: expect.any(String),
      headers: { 'content-type': 'application/pdf' },
      expiresIn: 600,
    });
    const file = await db().uploadedFile.findUniqueOrThrow({ where: { id: up.body.fileId } });
    expect(file.key).toMatch(/^resumes\/.+\.pdf$/);
    h.storage.put(file.key, pdf, 'application/pdf');

    const built = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ fileId: up.body.fileId })
      .expect(202);
    const row = await db().vaultImport.findUniqueOrThrow({ where: { id: built.body.id } });
    expect(row.text).toContain('Woodgrove Analytics');
    expect((await db().uploadedFile.findUniqueOrThrow({ where: { id: file.id } })).status).toBe(
      'parsed',
    );
  });

  it('rejects oversized, unsupported, missing and unreadable uploads', async () => {
    const { h, auth } = await setup();
    await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'a.pdf', mime: 'application/pdf', size: 6 * 1024 * 1024 })
      .expect(400);
    const bad = await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'a.png', mime: 'image/png', size: 10 })
      .expect(400);
    expect(bad.body.error.message).toBe('Upload a PDF, DOCX or TXT file');

    const up = await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'a.pdf', mime: 'application/pdf', size: 20 })
      .expect(200);
    const missing = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ fileId: up.body.fileId })
      .expect(400);
    expect(missing.body.error.message).toMatch(/did not finish/);
    const file = await db().uploadedFile.findUniqueOrThrow({ where: { id: up.body.fileId } });
    h.storage.put(file.key, Buffer.from('\x89PNG\x00\x01'), 'application/pdf');
    await h.req.post('/api/v1/vault/build').set(auth).send({ fileId: up.body.fileId }).expect(400);
    expect((await db().uploadedFile.findUniqueOrThrow({ where: { id: file.id } })).status).toBe(
      'rejected',
    );
  });
});

describe('vault editor', () => {
  it('creates, edits, hides and deletes roles and achievements with strength updates', async () => {
    const { h, auth } = await setup();
    const v0 = await buildAndConfirm(h, auth);
    const role = (
      await h.req
        .post('/api/v1/vault/roles')
        .set(auth)
        .send({ company: 'Litware', title: 'Intern', startDate: '2019-05', endDate: '2019-07' })
        .expect(201)
    ).body as VaultDto;
    const litware = role.roles.find((r) => r.company === 'Litware')!;
    expect(litware.order).toBe(2);

    const withAch = (
      await h.req
        .post('/api/v1/vault/achievements')
        .set(auth)
        .send({
          roleId: litware.id,
          text: 'Reconciled 400 invoices a week',
          metrics: [{ value: 400, unit: 'invoices', context: 'weekly' }],
          skills: ['excel'],
        })
        .expect(201)
    ).body as VaultDto;
    const ach = withAch.roles.find((r) => r.id === litware.id)!.achievements[0]!;
    expect(ach.skills).toEqual(['microsoft excel']);

    await h.req
      .patch(`/api/v1/vault/achievements/${ach.id}`)
      .set(auth)
      .send({ text: 'Reconciled 400 vendor invoices weekly', hidden: true })
      .expect(200);
    await h.req
      .patch(`/api/v1/vault/roles/${litware.id}`)
      .set(auth)
      .send({ title: 'Finance Intern' })
      .expect(200);
    await h.req
      .patch(`/api/v1/vault/roles/${litware.id}`)
      .set(auth)
      .send({ startDate: '2019-13' })
      .expect(400);
    const after = (await h.req.delete(`/api/v1/vault/achievements/${ach.id}`).set(auth).expect(200))
      .body as VaultDto;
    expect(after.roles.find((r) => r.id === litware.id)!.achievements).toEqual([]);
    await h.req.delete(`/api/v1/vault/roles/${litware.id}`).set(auth).expect(200);
    expect(((await h.req.get('/api/v1/vault').set(auth)).body as VaultDto).roles).toHaveLength(
      v0.roles.length,
    );
  });

  it('manages education, certifications, projects and skills (no duplicate skills)', async () => {
    const { h, auth } = await setup();
    await buildAndConfirm(h, auth);
    await h.req
      .post('/api/v1/vault/certs')
      .set(auth)
      .send({ name: 'CFA Level 1', issuer: 'CFA Institute', date: '2023-06' })
      .expect(201);
    await h.req
      .post('/api/v1/vault/education')
      .set(auth)
      .send({ institution: 'Adatum University', degree: 'MBA' })
      .expect(201);
    const p = (
      await h.req.post('/api/v1/vault/projects').set(auth).send({ name: 'Budget bot' }).expect(201)
    ).body as VaultDto;
    await h.req
      .post('/api/v1/vault/achievements')
      .set(auth)
      .send({ projectId: p.projects[0]!.id, text: 'Automated budget alerts' })
      .expect(201);
    await h.req.post('/api/v1/vault/achievements').set(auth).send({ text: 'orphan' }).expect(400);
    await h.req.post('/api/v1/vault/skills').set(auth).send({ name: 'Excel' }).expect(409);
    const s = (
      await h.req
        .post('/api/v1/vault/skills')
        .set(auth)
        .send({ name: 'SQL', proficiency: 'advanced' })
        .expect(201)
    ).body as VaultDto;
    expect(s.skills.map((x) => x.key)).toContain('sql');
    expect(s.certs[0]).toMatchObject({ name: 'CFA Level 1', date: '2023-06' });
  });

  it('reorders roles and achievements and validates the full id list', async () => {
    const { h, auth } = await setup();
    const v = await buildAndConfirm(h, auth);
    const ids = v.roles.map((r) => r.id).reverse();
    const re = (
      await h.req.post('/api/v1/vault/reorder').set(auth).send({ kind: 'roles', ids }).expect(200)
    ).body as VaultDto;
    expect(re.roles.map((r) => r.id)).toEqual(ids);
    await h.req
      .post('/api/v1/vault/reorder')
      .set(auth)
      .send({ kind: 'roles', ids: [ids[0]] })
      .expect(400);
    await h.req
      .post('/api/v1/vault/reorder')
      .set(auth)
      .send({ kind: 'roles', ids: [ids[0], ids[0]] })
      .expect(400);
    const role = v.roles[0]!;
    const achIds = role.achievements.map((a) => a.id).reverse();
    const ra = (
      await h.req
        .post('/api/v1/vault/reorder')
        .set(auth)
        .send({ kind: 'achievements', parentId: role.id, ids: achIds })
        .expect(200)
    ).body as VaultDto;
    expect(ra.roles.find((r) => r.id === role.id)!.achievements.map((a) => a.id)).toEqual(achIds);
    await h.req
      .post('/api/v1/vault/reorder')
      .set(auth)
      .send({ kind: 'achievements', ids: achIds })
      .expect(400);
  });

  it("cannot touch another user's vault items", async () => {
    const a = await setup();
    const v = await buildAndConfirm(a.h, a.auth);
    const { accessToken } = await signIn(a.h, 'intruder@example.com');
    const other = { authorization: `Bearer ${accessToken}` };
    await a.h.req
      .patch(`/api/v1/vault/roles/${v.roles[0]!.id}`)
      .set(other)
      .send({ title: 'x' })
      .expect(404);
    await a.h.req
      .delete(`/api/v1/vault/achievements/${v.roles[0]!.achievements[0]!.id}`)
      .set(other)
      .expect(404);
  });

  it('patches profile fields', async () => {
    const { h, auth } = await setup();
    await buildAndConfirm(h, auth);
    const r = (
      await h.req
        .patch('/api/v1/vault/profile')
        .set(auth)
        .send({
          headline: 'FP&A Analyst',
          links: [{ kind: 'linkedin', url: 'linkedin.com/in/neha' }],
        })
        .expect(200)
    ).body as VaultDto;
    expect(r.profile).toMatchObject({
      name: 'Neha Kulkarni',
      headline: 'FP&A Analyst',
      links: [{ kind: 'linkedin' }],
    });
  });
});

describe('gap questions', () => {
  it('lists open questions and turns answers into metrics, raising strength', async () => {
    const { h, auth } = await setup();
    const v = await buildAndConfirm(h, auth);
    const target = v.roles[0]!.achievements[1]!;
    const q1 = await db().vaultGapQuestion.create({
      data: {
        vaultId: v.id,
        achievementId: target.id,
        question: 'How many business units used the model?',
        expectedUnit: 'units',
      },
    });
    const q2 = await db().vaultGapQuestion.create({
      data: {
        vaultId: v.id,
        achievementId: v.roles[1]!.achievements[0]!.id,
        question: 'How many board meetings?',
      },
    });

    const list = await h.req.get('/api/v1/vault/gap-questions').set(auth).expect(200);
    expect(
      list.body.map((q: { id: string; achievementText: string }) => [q.id, q.achievementText]),
    ).toEqual([
      [q1.id, 'Built a rolling forecast model in Excel'],
      [q2.id, 'Prepared quarterly board packs'],
    ]);

    const r = await h.req
      .post('/api/v1/vault/gap-answers')
      .set(auth)
      .send({
        answers: [
          { questionId: q1.id, answer: 'Used by 6 business units' },
          { questionId: q2.id, skip: true },
        ],
      })
      .expect(200);
    expect(r.body.metricsAdded).toBe(1);
    const updated = (r.body.vault as VaultDto).roles[0]!.achievements[1]!;
    expect(updated.metrics).toEqual([
      { value: 6, unit: 'business units', context: 'How many business units used the model?' },
    ]);
    expect(r.body.vault.strength).toBeGreaterThan(v.strength);
    expect(r.body.vault.openGapQuestions).toBe(0);
    await h.req
      .post('/api/v1/vault/gap-answers')
      .set(auth)
      .send({ answers: [{ questionId: q1.id, answer: 'again' }] })
      .expect(404);
  });

  it('queues a refresh', async () => {
    const { h, auth } = await setup();
    await buildAndConfirm(h, auth);
    await h.req.post('/api/v1/vault/gap-questions/refresh').set(auth).expect(202);
    expect(h.queue.jobs.at(-1)?.name).toBe('vault.gapQuestions');
  });
});
