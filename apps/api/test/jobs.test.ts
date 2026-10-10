import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jdHash, normalizeJdText } from '@tailor/core/ats';
import { JD_PROMPT_VERSION } from '@tailor/jobs';
import type { AnonCheckDto, AtsScoreDto, JobDto, JobExtraction, VaultDraft } from '@tailor/shared';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db, makeApp, refreshCookie, resetDb, signIn } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

const JD = `Data Analyst at Fabrikam, Austin TX.
We are hiring a Data Analyst to own weekly business reviews and design experiments across 300 stores.
Requirements: 3+ years of SQL and Python, Tableau dashboards, stakeholder management and A/B testing.
Nice to have: dbt and Snowflake. You will partner with category managers and present recommendations.`;

const EXTRACTION: JobExtraction = {
  title: 'Data Analyst',
  company: 'Fabrikam',
  location: 'Austin, TX',
  seniority: 'mid',
  mustHave: [
    { name: 'SQL', aliases: [] },
    { name: 'Python', aliases: [] },
    { name: 'Tableau', aliases: [] },
    { name: 'Stakeholder management', aliases: [] },
  ],
  niceToHave: [{ name: 'dbt', aliases: [] }],
  responsibilities: [],
  keywords: [],
  education: [],
};

/** Worker stand-in: extract a pending job into the shared cache. */
async function workerExtracts(jobId: string, extraction = EXTRACTION) {
  const job = await db().job.findUniqueOrThrow({ where: { id: jobId } });
  const entry = await db().jdCache.create({
    data: {
      hash: jdHash(job.rawText!),
      urlNorm: job.sourceUrl,
      raw: job.rawText!,
      extracted: extraction,
      model: 'test',
      promptVersion: JD_PROMPT_VERSION,
    },
  });
  await db().job.update({
    where: { id: jobId },
    data: { status: 'ready', jdCacheId: entry.id, rawText: null },
  });
}

async function user(h: ReturnType<typeof makeApp>, email = 'asha@example.com') {
  const { accessToken } = await signIn(h, email);
  return { authorization: `Bearer ${accessToken}` };
}

describe('jobs', () => {
  it('queues extraction for a new JD, saves it to the tracker, and serves cache hits synchronously', async () => {
    const h = makeApp();
    const auth = await user(h);
    const first = await h.req.post('/api/v1/jobs').set(auth).send({ text: JD }).expect(202);
    expect(first.body).toMatchObject({ status: 'pending', extraction: null, source: 'paste' });
    expect(h.queue.jobs).toEqual([{ name: 'jd.extract', data: { jobId: first.body.id } }]);
    expect(await db().application.findFirst({ where: { jobId: first.body.id } })).toMatchObject({
      status: 'SAVED',
      source: 'manual',
    });
    expect((await db().job.findUniqueOrThrow({ where: { id: first.body.id } })).rawText).toBe(
      normalizeJdText(JD),
    );

    await workerExtracts(first.body.id);
    const ready = (await h.req.get(`/api/v1/jobs/${first.body.id}`).set(auth).expect(200))
      .body as JobDto;
    expect(ready).toMatchObject({
      status: 'ready',
      extraction: { title: 'Data Analyst', company: 'Fabrikam' },
    });

    // Another user pastes the same JD with different whitespace/case: shared cache, no AI call.
    const auth2 = await user(h, 'other@example.com');
    const second = await h.req
      .post('/api/v1/jobs')
      .set(auth2)
      .send({ text: `  ${JD.toUpperCase()}\n\n\n` })
      .expect(201);
    expect(second.body).toMatchObject({ status: 'ready', extraction: { title: 'Data Analyst' } });
    expect(h.queue.jobs).toHaveLength(1);
  });

  it('does not reuse a cache entry from an older extraction prompt', async () => {
    const h = makeApp();
    const auth = await user(h);
    const text = normalizeJdText(JD);
    await db().jdCache.create({
      data: {
        hash: jdHash(text),
        raw: text,
        extracted: EXTRACTION,
        model: 'old',
        promptVersion: 'v0',
      },
    });
    const job = await h.req.post('/api/v1/jobs').set(auth).send({ text: JD }).expect(202);
    expect(job.body).toMatchObject({ status: 'pending', extraction: null });
    expect(h.queue.jobs).toEqual([{ name: 'jd.extract', data: { jobId: job.body.id } }]);
  });

  it('fetches URLs through the safe fetcher and caches by normalized URL', async () => {
    let fetched = 0;
    const h = makeApp({ fetchJobText: async () => (fetched++, JD) });
    const auth = await user(h);
    const a = await h.req
      .post('/api/v1/jobs')
      .set(auth)
      .send({ url: 'https://www.jobs.example.com/123?utm_source=x#apply' })
      .expect(202);
    expect(a.body).toMatchObject({ source: 'url', sourceUrl: 'https://jobs.example.com/123' });
    await workerExtracts(a.body.id);
    const b = await h.req
      .post('/api/v1/jobs')
      .set(auth)
      .send({ url: 'http://jobs.example.com/123/' })
      .expect(201);
    expect(b.body.status).toBe('ready');
    expect(fetched).toBe(1);
    await h.req.post('/api/v1/jobs').set(auth).send({ url: 'ftp://x.example.com/1' }).expect(400);
    await h.req.post('/api/v1/jobs').set(auth).send({ text: 'too short' }).expect(400);
  });

  it('applies and resets chip edits', async () => {
    const h = makeApp();
    const auth = await user(h);
    const job = await h.req.post('/api/v1/jobs').set(auth).send({ text: JD }).expect(202);
    await h.req.patch(`/api/v1/jobs/${job.body.id}`).set(auth).send({ mustHave: [] }).expect(409);
    await workerExtracts(job.body.id);
    const edited = await h.req
      .patch(`/api/v1/jobs/${job.body.id}`)
      .set(auth)
      .send({
        mustHave: [
          { name: 'SQL', aliases: [] },
          { name: 'Looker', aliases: [] },
        ],
      })
      .expect(200);
    expect(edited.body.edited).toBe(true);
    expect(edited.body.extraction.mustHave.map((k: { name: string }) => k.name)).toEqual([
      'SQL',
      'Looker',
    ]);
    expect(edited.body.extraction.niceToHave.map((k: { name: string }) => k.name)).toEqual(['dbt']);
    const reset = await h.req.delete(`/api/v1/jobs/${job.body.id}/overrides`).set(auth).expect(200);
    expect(reset.body).toMatchObject({ edited: false });
    expect(reset.body.extraction.mustHave).toHaveLength(4);
  });

  it('scores the vault against the job and keeps jobs private', async () => {
    const h = makeApp();
    const auth = await user(h);
    const job = await h.req.post('/api/v1/jobs').set(auth).send({ text: JD }).expect(202);
    await workerExtracts(job.body.id);
    await h.req.get(`/api/v1/jobs/${job.body.id}/match`).set(auth).expect(404);

    const me = await db().user.findFirstOrThrow({ where: { email: 'asha@example.com' } });
    const draft: VaultDraft['profile'] = {
      name: 'Asha',
      headline: 'Data Analyst',
      email: 'a@example.com',
      links: [],
    };
    await db().vault.create({
      data: {
        userId: me.id,
        profile: draft,
        roles: {
          create: [
            {
              company: 'Contoso',
              title: 'Data Analyst',
              startDate: '2022-01',
              order: 0,
              achievements: {
                create: [
                  {
                    text: 'Automated reporting in Python and SQL, cutting effort by 63%',
                    metrics: [],
                    skills: [],
                    impactType: [],
                    source: 'parse',
                    order: 0,
                  },
                ],
              },
            },
          ],
        },
        skills: { create: [{ name: 'Tableau', key: 'tableau', order: 0 }] },
      },
    });
    const m = (await h.req.get(`/api/v1/jobs/${job.body.id}/match`).set(auth).expect(200))
      .body as AtsScoreDto;
    expect(m.keywords.find((k) => k.name === 'SQL')).toMatchObject({
      state: 'matched',
      inBullets: true,
    });
    expect(m.keywords.find((k) => k.name === 'Tableau')).toMatchObject({
      state: 'matched',
      inBullets: false,
    });
    expect(m.score).toBeGreaterThan(40);

    const other = await user(h, 'other@example.com');
    await h.req.get(`/api/v1/jobs/${job.body.id}`).set(other).expect(404);
    const list = await h.req.get('/api/v1/jobs').set(auth).expect(200);
    expect(list.body.items.map((j: JobDto) => j.id)).toEqual([job.body.id]);
  });
});

describe('anonymous score check (PRD F1)', () => {
  const RESUME = readFileSync(
    resolve(import.meta.dirname, '../../../evals/resumes/files/r08-finance-txt.txt'),
    'utf8',
  );
  const body = (over: Record<string, unknown> = {}) => ({
    resume: { text: RESUME },
    job: { text: JD },
    turnstileToken: 'ok',
    fingerprint: 'fp-1',
    ...over,
  });

  it('requires Turnstile, then returns a pending check readable only with the cookie', async () => {
    const h = makeApp();
    await h.req
      .post('/api/v1/anon/check')
      .send(body({ turnstileToken: 'fail' }))
      .expect(403);
    const r = await h.req.post('/api/v1/anon/check').send(body()).expect(201);
    expect(r.body).toMatchObject({ status: 'pending', ats: null });
    const set = (r.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('tailor_anon='),
    )!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Path=\/api\/v1\/anon/);
    const cookie = set.split(';')[0]!;

    await h.req.get(`/api/v1/anon/check/${r.body.id}`).expect(404);
    await h.req
      .get(`/api/v1/anon/check/${r.body.id}`)
      .set('cookie', 'tailor_anon=wrong')
      .expect(404);

    const session = await db().anonSession.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(session.fpHash).toHaveLength(64);
    await workerExtracts(session.jobId!);
    const ready = (
      await h.req.get(`/api/v1/anon/check/${r.body.id}`).set('cookie', cookie).expect(200)
    ).body as AnonCheckDto;
    expect(ready).toMatchObject({
      status: 'ready',
      job: { title: 'Data Analyst', company: 'Fabrikam' },
    });
    expect(ready.ats!.score).toBeGreaterThan(0);
    expect(ready.ats!.keywords.find((k) => k.name === 'SQL')!.state).toBe('missing');
    expect(await db().application.count()).toBe(0); // anonymous jobs are not tracked
    expect(refreshCookie(r)).toBeNull();
  });

  it('limits checks per IP per day', async () => {
    const h = makeApp({ env: { ANON_CHECKS_PER_IP_PER_DAY: '2' } });
    await h.req.post('/api/v1/anon/check').send(body()).expect(201);
    await h.req.post('/api/v1/anon/check').send(body()).expect(201);
    await h.req.post('/api/v1/anon/check').send(body()).expect(429);
  });

  it('accepts an anonymous upload and reports two-column layouts', async () => {
    const h = makeApp();
    const pdf = readFileSync(
      resolve(import.meta.dirname, '../../../evals/resumes/files/r07-devops-sidebar.pdf'),
    );
    const up = await h.req
      .post('/api/v1/anon/upload-url')
      .send({ fileName: 'cv.pdf', mime: 'application/pdf', size: pdf.byteLength })
      .expect(200);
    const file = await db().uploadedFile.findUniqueOrThrow({ where: { id: up.body.fileId } });
    expect(file.userId).toBeNull();
    h.storage.put(file.key, pdf, 'application/pdf');
    const r = await h.req
      .post('/api/v1/anon/check')
      .send(body({ resume: { fileId: up.body.fileId } }))
      .expect(201);
    const session = await db().anonSession.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(session.resumeLayout).toEqual({ twoColumn: true });
    expect(session.resumeText).toContain('Litware Cloud');
    await h.req
      .post('/api/v1/anon/check')
      .send(body({ resume: { fileId: 'nope' } }))
      .expect(404);
  });

  it('expires sessions with their jobs and uploads', async () => {
    const h = makeApp();
    const r = await h.req.post('/api/v1/anon/check').send(body()).expect(201);
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await db().anonSession.update({
      where: { id: r.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await h.req.get(`/api/v1/anon/check/${r.body.id}`).set('cookie', cookie).expect(404);
    const anon = h.app.locals['anon'] as { cleanupExpired: () => Promise<number> };
    expect(await anon.cleanupExpired()).toBe(1);
    expect(await db().anonSession.count()).toBe(0);
    expect(await db().job.count()).toBe(0);
  });

  it('exposes the public Turnstile site key and the upload limit', async () => {
    const h = makeApp({
      env: { TURNSTILE_SITE_KEY: '1x00000000000000000000AA', FILE_MAX_BYTES: '4194304' },
    });
    expect((await h.req.get('/api/v1/config').expect(200)).body).toEqual({
      turnstileSiteKey: '1x00000000000000000000AA',
      maxUploadBytes: 4 * 1024 * 1024,
    });
  });
});
