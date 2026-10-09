import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';

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
