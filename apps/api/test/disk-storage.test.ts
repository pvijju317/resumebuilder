import { mkdtempSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DiskStorage, createStorage } from '../src/services/storage.js';
import { db, makeApp, resetDb, signIn, testEnv } from './harness.js';

beforeEach(resetDb);
afterAll(() => db().$disconnect());

const PDF = readFileSync(
  resolve(import.meta.dirname, '../../../evals/resumes/files/r01-fresher-cs.pdf'),
);
const newDisk = () => new DiskStorage(mkdtempSync(join(tmpdir(), 'tailor-disk-')), 'x'.repeat(32));

describe('DiskStorage (dev temp storage)', () => {
  it('accepts a signed upload and feeds the vault build', async () => {
    const disk = newDisk();
    const h = makeApp({ storage: disk });
    const { accessToken } = await signIn(h);
    const auth = { authorization: `Bearer ${accessToken}` };
    await h.req.patch('/api/v1/me').set(auth).send({ consent: true });
    const up = await h.req
      .post('/api/v1/files/upload-url')
      .set(auth)
      .send({ fileName: 'cv.pdf', mime: 'application/pdf', size: PDF.byteLength })
      .expect(200);
    expect(up.body.url).toMatch(/^\/api\/v1\/files\/upload\//);

    await h.req.put(up.body.url).set('content-type', 'application/pdf').send(PDF).expect(200);
    const built = await h.req
      .post('/api/v1/vault/build')
      .set(auth)
      .send({ fileId: up.body.fileId })
      .expect(202);
    expect(
      (await db().vaultImport.findUniqueOrThrow({ where: { id: built.body.id } })).text,
    ).toContain('Northwind Payments');
  });

  it('rejects tampered, expired and mismatched uploads', async () => {
    const disk = newDisk();
    const h = makeApp({ storage: disk });
    const good = disk.sign({
      key: 'resumes/u/a.pdf',
      mime: 'application/pdf',
      size: 3,
      exp: Date.now() + 60_000,
    });
    await h.req
      .put(`/api/v1/files/upload/${good}x`)
      .set('content-type', 'application/pdf')
      .send(Buffer.from('abc'))
      .expect(401);
    await h.req
      .put(`/api/v1/files/upload/nodot`)
      .set('content-type', 'application/pdf')
      .send(Buffer.from('abc'))
      .expect(401);
    const expired = disk.sign({
      key: 'resumes/u/a.pdf',
      mime: 'application/pdf',
      size: 3,
      exp: Date.now() - 1,
    });
    const r = await h.req
      .put(`/api/v1/files/upload/${expired}`)
      .set('content-type', 'application/pdf')
      .send(Buffer.from('abc'))
      .expect(401);
    expect(r.body.error.message).toMatch(/expired/);
    await h.req
      .put(`/api/v1/files/upload/${good}`)
      .set('content-type', 'text/plain')
      .send(Buffer.from('abc'))
      .expect(400);
    await h.req
      .put(`/api/v1/files/upload/${good}`)
      .set('content-type', 'application/pdf')
      .send(Buffer.from('abcd'))
      .expect(400);
    await h.req
      .put(`/api/v1/files/upload/${good}`)
      .set('content-type', 'application/pdf')
      .send(Buffer.from('abc'))
      .expect(200);
    expect(await disk.head('resumes/u/a.pdf')).toMatchObject({ size: 3 });
    await expect(disk.write('../escape', Buffer.from('x'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('sweeps files older than the retention window', async () => {
    const disk = newDisk();
    await disk.write('resumes/u/old.pdf', Buffer.from('old'));
    await disk.write('resumes/u/new.pdf', Buffer.from('new'));
    const dir = (disk as unknown as { dir: string }).dir;
    const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000);
    utimesSync(join(dir, 'resumes/u/old.pdf'), twoDaysAgo, twoDaysAgo);
    expect(await disk.sweep(24 * 3_600_000)).toBe(1);
    expect(await disk.head('resumes/u/old.pdf')).toBeNull();
    expect(await disk.head('resumes/u/new.pdf')).not.toBeNull();
    await disk.delete('resumes/u/new.pdf');
    expect(await new DiskStorage('/nonexistent-tailor', 's').sweep(1)).toBe(0);
  });

  it('is refused in production and selects S3 when configured', () => {
    expect(() =>
      createStorage({ ...testEnv(), NODE_ENV: 'production', STORAGE_DRIVER: 'disk' }),
    ).toThrow(/development only/);
    expect(createStorage({ ...testEnv(), STORAGE_DRIVER: 's3' })).toBeNull();
    expect(createStorage(testEnv())).toBeInstanceOf(DiskStorage);
  });
});
