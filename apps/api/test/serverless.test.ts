import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineQueue } from '../src/services/queue.js';
import { DbStorage } from '../src/services/storage.js';
import { db, makeApp, resetDb, signIn } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

const PDF = readFileSync(
  resolve(import.meta.dirname, '../../../evals/resumes/files/r01-fresher-cs.pdf'),
);

describe('DbStorage (serverless trial storage)', () => {
  it('stores signed uploads in Postgres and feeds the vault build', async () => {
    const storage = new DbStorage(db(), 'x'.repeat(32));
    const h = makeApp({ storage });
    const { accessToken } = await signIn(h);
    const auth = { authorization: `Bearer ${accessToken}` };
    await h.req.patch('/api/v1/me').set(auth).send({ consent: true });
    const up = await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'cv.pdf', mime: 'application/pdf', size: PDF.byteLength })
      .expect(200);
    await h.req.put(up.body.url).set('content-type', 'application/pdf').send(PDF).expect(200);
    expect(await db().storedObject.count()).toBe(1);
    const built = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ fileId: up.body.fileId })
      .expect(202);
    expect(
      (await db().vaultImport.findUniqueOrThrow({ where: { id: built.body.id } })).text,
    ).toContain('Northwind Payments');
  });

  it('heads, deletes and sweeps old objects', async () => {
    const s = new DbStorage(db(), 'x'.repeat(32));
    await s.write('a', Buffer.from('aaa'), 'text/plain');
    await s.write('b', Buffer.from('bb'), 'text/plain');
    await db().storedObject.update({
      where: { key: 'a' },
      data: { createdAt: new Date(Date.now() - 48 * 3_600_000) },
    });
    expect(await s.head('b')).toEqual({ size: 2, contentType: 'text/plain' });
    expect(await s.sweep(24 * 3_600_000)).toBe(1);
    expect(await s.head('a')).toBeNull();
    await s.delete('b');
    await expect(s.get('b')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('InlineQueue', () => {
  it('schedules jobs and retries once after the requested delay', async () => {
    vi.useFakeTimers();
    const scheduled: Promise<unknown>[] = [];
    const calls: string[] = [];
    const run = vi.fn(
      async (
        name: string,
        data: unknown,
        requeue: (n: string, d: never, ms: number) => Promise<void>,
      ) => {
        calls.push(name);
        if (calls.length === 1)
          await requeue(name, { ...(data as object), requeued: true } as never, 30_000);
      },
    );
    const q = new InlineQueue(run, (p) => scheduled.push(p), vi.fn());
    await q.enqueue({ name: 'jd.extract', data: { jobId: 'j1' } });
    expect(scheduled).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    await scheduled[0];
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![1]).toEqual({ jobId: 'j1', requeued: true });
    vi.useRealTimers();
  });

  it('reports failures instead of throwing into the request', async () => {
    const onError = vi.fn();
    const scheduled: Promise<unknown>[] = [];
    const q = new InlineQueue(
      async () => Promise.reject(new Error('boom')),
      (p) => scheduled.push(p),
      onError,
    );
    await q.enqueue({ name: 'vault.parse', data: { importId: 'i1' } });
    await scheduled[0];
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'vault.parse');
  });
});

describe('cron endpoint', () => {
  it('is hidden without the secret and runs housekeeping with it', async () => {
    await makeApp().req.get('/api/v1/internal/cron').expect(404);
    const h = makeApp({ env: { CRON_SECRET: 's3cret-value' } });
    await h.req.get('/api/v1/internal/cron').set('authorization', 'Bearer wrong').expect(404);
    const r = await h.req
      .get('/api/v1/internal/cron')
      .set('authorization', 'Bearer s3cret-value')
      .expect(200);
    expect(r.body).toEqual({ sessions: 0, uploads: 0 });
  });
});
