import { parseResumeText } from '@tailor/core/ats';
import type { PrismaClient } from '@tailor/db';
import {
  AppError,
  RESUME_MIME,
  type AnonCheckDto,
  type CreateJobBody,
  type ResumeMime,
  type UploadUrlResponse,
} from '@tailor/shared';
import type { ServerEnv } from '@tailor/shared/env';
import { randomUUID } from 'node:crypto';
import { randomToken, sha256 } from '../lib/crypto.js';
import { extractResumeText } from './extract.js';
import type { JobsService } from './jobs.service.js';
import { effectiveExtraction, scoreDto } from './match.js';
import type { Storage } from './storage.js';

export interface AnonDeps {
  prisma: PrismaClient;
  env: ServerEnv;
  jobs: JobsService;
  storage: Storage | null;
}

/** PRD F1: ATS score without an account. Sessions expire after ANON_SESSION_TTL_HOURS. */
export function createAnonService(deps: AnonDeps) {
  const { prisma, env, jobs } = deps;

  async function dto(id: string): Promise<AnonCheckDto> {
    const s = await prisma.anonSession.findUniqueOrThrow({ where: { id } });
    const job = s.jobId
      ? await prisma.job.findUnique({ where: { id: s.jobId }, include: { jdCache: true } })
      : null;
    const extraction = job?.jdCache
      ? effectiveExtraction(job.jdCache.extracted, job.overrides)
      : null;
    const layout = (s.resumeLayout ?? {}) as { twoColumn?: boolean };
    return {
      id: s.id,
      status:
        !job || job.status === 'pending'
          ? 'pending'
          : job.status === 'failed' || !extraction
            ? 'failed'
            : 'ready',
      error: job?.error ?? null,
      job: extraction ? { title: extraction.title, company: extraction.company ?? null } : null,
      ats: extraction ? scoreDto(parseResumeText(s.resumeText, layout), extraction) : null,
      expiresAt: s.expiresAt.toISOString(),
    };
  }

  return {
    async createUploadUrl(body: {
      fileName: string;
      mime: ResumeMime;
      size: number;
    }): Promise<UploadUrlResponse> {
      if (!deps.storage)
        throw new AppError(
          'INTERNAL',
          'File uploads are not available right now. Paste your resume instead.',
          503,
        );
      if (body.size > env.FILE_MAX_BYTES)
        throw new AppError('VALIDATION', 'Files must be 5 MB or smaller.', 400);
      const key = `anon/${randomUUID()}.${RESUME_MIME[body.mime]}`;
      const file = await prisma.uploadedFile.create({
        data: {
          userId: null,
          key,
          fileName: body.fileName,
          mime: body.mime,
          size: body.size,
          status: 'pending',
        },
      });
      const { url, headers } = await deps.storage.presignPut(
        key,
        body.mime,
        body.size,
        env.UPLOAD_URL_TTL_SECONDS,
      );
      return { fileId: file.id, url, headers, expiresIn: env.UPLOAD_URL_TTL_SECONDS };
    },

    /** Returns the session dto and the cookie token the caller must set. */
    async check(input: {
      resume: { text: string } | { fileId: string };
      job: CreateJobBody;
      ipHash: string;
      fpHash: string | null;
    }) {
      let resumeText: string;
      let twoColumn = false;
      if ('fileId' in input.resume) {
        const file = await prisma.uploadedFile.findFirst({
          where: {
            id: input.resume.fileId,
            userId: null,
            createdAt: { gte: new Date(Date.now() - 3_600_000) },
          },
        });
        if (!file || !deps.storage)
          throw new AppError('NOT_FOUND', 'Upload not found. Please try again.', 404);
        const extracted = await extractResumeText(await deps.storage.get(file.key));
        resumeText = extracted.text;
        twoColumn = extracted.twoColumn;
        await prisma.uploadedFile.update({ where: { id: file.id }, data: { status: 'parsed' } });
      } else {
        resumeText = input.resume.text;
      }
      const job = await jobs.create({ userId: null }, input.job, 'anon');
      const token = randomToken();
      const session = await prisma.anonSession.create({
        data: {
          tokenHash: sha256(token),
          ipHash: input.ipHash,
          fpHash: input.fpHash,
          resumeText,
          resumeLayout: { twoColumn },
          jobId: job.id,
          expiresAt: new Date(Date.now() + env.ANON_SESSION_TTL_HOURS * 3_600_000),
        },
      });
      return { token, dto: await dto(session.id) };
    },

    async get(id: string, token: string | undefined): Promise<AnonCheckDto> {
      const s = await prisma.anonSession.findUnique({ where: { id } });
      if (!s || !token || s.tokenHash !== sha256(token) || s.expiresAt < new Date()) {
        throw new AppError('NOT_FOUND', 'This check has expired. Run a new one.', 404);
      }
      return dto(id);
    },

    /** Delete expired sessions with their anonymous jobs and uploads (PRD: 72 h). */
    async cleanupExpired(now = new Date()): Promise<number> {
      const expired = await prisma.anonSession.findMany({
        where: { expiresAt: { lt: now }, claimedByUserId: null },
        select: { id: true, jobId: true },
      });
      const jobIds = expired.flatMap((s) => (s.jobId ? [s.jobId] : []));
      const files = await prisma.uploadedFile.findMany({
        where: {
          userId: null,
          createdAt: { lt: new Date(now.getTime() - env.ANON_SESSION_TTL_HOURS * 3_600_000) },
        },
      });
      for (const f of files) await deps.storage?.delete(f.key).catch(() => undefined);
      await prisma.$transaction([
        prisma.anonSession.deleteMany({ where: { id: { in: expired.map((s) => s.id) } } }),
        prisma.job.deleteMany({ where: { id: { in: jobIds }, userId: null } }),
        prisma.uploadedFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } }),
      ]);
      return expired.length;
    },
  };
}
export type AnonService = ReturnType<typeof createAnonService>;
