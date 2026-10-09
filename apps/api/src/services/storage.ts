import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { AppError } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import type { PrismaClient } from '@tailor/db';

/** Private object storage for uploads. S3 API, so R2/S3/S3Mock are interchangeable via env. */
export interface Storage {
  /** Presigned PUT bound to the exact content type and length. */
  presignPut(
    key: string,
    mime: string,
    size: number,
    ttlSeconds: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export function createS3Storage(env: ServerEnv): Storage | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) return null;
  const bucket = env.S3_BUCKET;
  const client = new S3Client({
    region: env.S3_REGION,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  return {
    async presignPut(key, mime, size, ttlSeconds) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, ContentLength: size }),
        { expiresIn: ttlSeconds, signableHeaders: new Set(['content-type', 'content-length']) },
      );
      return { url, headers: { 'content-type': mime } };
    },
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
          return null;
        throw e;
      }
    },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!r.Body) throw new Error(`empty body for ${key}`);
      return r.Body.transformToByteArray();
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** In-memory storage for tests and local runs without a bucket. Uploads go through `put`. */
export class MemoryStorage implements Storage {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async presignPut(key: string, mime: string) {
    return { url: `memory://${key}`, headers: { 'content-type': mime } };
  }
  put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { size: o.body.byteLength, contentType: o.contentType } : null;
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new AppError('NOT_FOUND', 'File not found', 404);
    return o.body;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

/**
 * Storage that receives uploads through our own API: PUT /api/v1/files/upload/:token, where the
 * token is an HMAC over (key, mime, size, expiry). Same browser flow as a presigned S3/R2 URL.
 */
export abstract class SignedUploadStorage implements Storage {
  constructor(private readonly secret: string) {}

  sign(payload: { key: string; mime: string; size: number; exp: number }): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', this.secret).update(`upload:${body}`).digest('base64url')}`;
  }

  verify(token: string): { key: string; mime: string; size: number; exp: number } {
    const [body, sig] = token.split('.');
    const expected = body
      ? createHmac('sha256', this.secret).update(`upload:${body}`).digest('base64url')
      : '';
    if (
      !body ||
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      throw new AppError('UNAUTHORIZED', 'Upload link is invalid.', 401);
    }
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      key: string;
      mime: string;
      size: number;
      exp: number;
    };
    if (p.exp < Date.now())
      throw new AppError('UNAUTHORIZED', 'Upload link has expired. Please try again.', 401);
    return p;
  }

  async presignPut(key: string, mime: string, size: number, ttlSeconds: number) {
    const token = this.sign({ key, mime, size, exp: Date.now() + ttlSeconds * 1000 });
    return { url: `/api/v1/files/upload/${token}`, headers: { 'content-type': mime } };
  }

  abstract write(key: string, body: Uint8Array, mime: string): Promise<void>;
  abstract head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  abstract get(key: string): Promise<Uint8Array>;
  abstract delete(key: string): Promise<void>;
  /** Delete objects older than `maxAgeMs`; returns the number removed. */
  abstract sweep(maxAgeMs: number, now?: number): Promise<number>;
}

/** Local temp folder for development. */
export class DiskStorage extends SignedUploadStorage {
  constructor(
    private readonly dir: string,
    secret: string,
  ) {
    super(secret);
  }

  private path(key: string) {
    if (key.includes('..') || key.startsWith('/'))
      throw new AppError('BAD_REQUEST', 'Invalid key', 400);
    return resolvePath(this.dir, key);
  }

  async write(key: string, body: Uint8Array) {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async head(key: string) {
    try {
      const s = await stat(this.path(key));
      return { size: s.size, contentType: null };
    } catch {
      return null;
    }
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }

  async sweep(maxAgeMs: number, now = Date.now()): Promise<number> {
    let removed = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = resolvePath(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (now - (await stat(full)).mtimeMs > maxAgeMs) {
          await rm(full, { force: true });
          removed++;
        }
      }
    };
    await walk(this.dir);
    return removed;
  }
}

/** Upload bytes kept in Postgres (serverless trial without object storage). */
export class DbStorage extends SignedUploadStorage {
  constructor(
    private readonly prisma: PrismaClient,
    secret: string,
  ) {
    super(secret);
  }

  async write(key: string, body: Uint8Array, mime: string) {
    const data = new Uint8Array(body);
    await this.prisma.storedObject.upsert({
      where: { key },
      create: { key, mime, size: data.byteLength, body: data },
      update: { mime, size: data.byteLength, body: data, createdAt: new Date() },
    });
  }

  async head(key: string) {
    const o = await this.prisma.storedObject.findUnique({
      where: { key },
      select: { size: true, mime: true },
    });
    return o ? { size: o.size, contentType: o.mime } : null;
  }

  async get(key: string) {
    const o = await this.prisma.storedObject.findUnique({ where: { key }, select: { body: true } });
    if (!o) throw new AppError('NOT_FOUND', 'File not found', 404);
    return new Uint8Array(o.body);
  }

  async delete(key: string) {
    await this.prisma.storedObject.deleteMany({ where: { key } });
  }

  async sweep(maxAgeMs: number, now = Date.now()) {
    const r = await this.prisma.storedObject.deleteMany({
      where: { createdAt: { lt: new Date(now - maxAgeMs) } },
    });
    return r.count;
  }
}

export function createStorage(env: ServerEnv, prisma?: PrismaClient): Storage | null {
  if (env.STORAGE_DRIVER === 's3') return createS3Storage(env);
  if (env.STORAGE_DRIVER === 'db') {
    if (!prisma) throw new Error('STORAGE_DRIVER=db needs a database client');
    return new DbStorage(prisma, env.JWT_SECRET);
  }
  if (env.NODE_ENV === 'production') throw new Error('STORAGE_DRIVER=disk is for development only');
  // Relative paths are anchored at the repo root, not the process cwd.
  const dir = isAbsolute(env.STORAGE_DISK_DIR)
    ? env.STORAGE_DISK_DIR
    : resolvePath(import.meta.dirname, '../../../..', env.STORAGE_DISK_DIR);
  return new DiskStorage(dir, env.JWT_SECRET);
}
