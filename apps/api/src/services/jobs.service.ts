import { jdHash, normalizeJdText, normalizeJobUrl } from '@tailor/core/ats';
import { loadVault, Prisma, type PrismaClient } from '@tailor/db';
import {
  AppError,
  type AtsScoreDto,
  type CreateJobBody,
  type JobDto,
  type JobOverrides,
} from '@tailor/shared';
import { effectiveExtraction, scoreDto, vaultToAtsResume } from './match.js';
import type { JobQueue } from './queue.js';

export interface JobsDeps {
  prisma: PrismaClient;
  queue: JobQueue;
  fetchJobText: (url: string) => Promise<string>;
}

type JobRow = Prisma.JobGetPayload<{ include: { jdCache: true } }>;

export function toJobDto(j: JobRow): JobDto {
  return {
    id: j.id,
    status: j.status as JobDto['status'],
    error: j.error,
    source: j.source,
    sourceUrl: j.sourceUrl,
    extraction: j.jdCache ? effectiveExtraction(j.jdCache.extracted, j.overrides) : null,
    edited: !!j.overrides,
    createdAt: j.createdAt.toISOString(),
  };
}

export function createJobsService(deps: JobsDeps) {
  const { prisma, queue } = deps;

  return {
    /**
     * New job from pasted text or a link. JD extraction is shared across users: a cache hit
     * (by normalized URL, then by text hash) makes the job ready immediately; otherwise the
     * worker extracts it (TRD §8: sync if cached, else async).
     */
    async create(
      owner: { userId: string | null },
      body: CreateJobBody,
      source: string,
    ): Promise<JobRow> {
      let urlNorm: string | null = null;
      let text: string;
      if ('url' in body) {
        urlNorm = normalizeJobUrl(body.url);
        if (!urlNorm) throw new AppError('VALIDATION', 'Enter a valid http(s) link.', 400);
        const byUrl = await prisma.jdCache.findUnique({ where: { urlNorm } });
        if (byUrl) return this.attach(owner, { jdCacheId: byUrl.id, source, sourceUrl: urlNorm });
        text = normalizeJdText(await deps.fetchJobText(urlNorm));
      } else {
        text = normalizeJdText(body.text);
      }
      const byHash = await prisma.jdCache.findUnique({ where: { hash: jdHash(text) } });
      if (byHash) return this.attach(owner, { jdCacheId: byHash.id, source, sourceUrl: urlNorm });

      const job = await prisma.job.create({
        data: {
          userId: owner.userId,
          status: 'pending',
          rawText: text,
          source,
          sourceUrl: urlNorm,
        },
        include: { jdCache: true },
      });
      if (owner.userId) await saveToTracker(prisma, owner.userId, job.id, source);
      await queue.enqueue({ name: 'jd.extract', data: { jobId: job.id } });
      return job;
    },

    async attach(
      owner: { userId: string | null },
      data: { jdCacheId: string; source: string; sourceUrl: string | null },
    ) {
      const job = await prisma.job.create({
        data: { ...data, userId: owner.userId, status: 'ready' },
        include: { jdCache: true },
      });
      if (owner.userId) await saveToTracker(prisma, owner.userId, job.id, data.source);
      return job;
    },

    async get(userId: string, id: string): Promise<JobRow> {
      const job = await prisma.job.findFirst({ where: { id, userId }, include: { jdCache: true } });
      if (!job) throw new AppError('NOT_FOUND', 'Job not found', 404);
      return job;
    },

    async list(userId: string, opts: { cursor?: string; limit?: number } = {}) {
      const limit = Math.min(50, opts.limit ?? 20);
      const rows = await prisma.job.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        include: { jdCache: true },
      });
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
      };
    },

    async setOverrides(userId: string, id: string, overrides: JobOverrides): Promise<JobRow> {
      const job = await this.get(userId, id);
      if (job.status !== 'ready')
        throw new AppError('CONFLICT', 'The job is still being read.', 409);
      const merged = { ...((job.overrides as object | null) ?? {}), ...overrides };
      return prisma.job.update({
        where: { id },
        data: { overrides: merged },
        include: { jdCache: true },
      });
    },

    async resetOverrides(userId: string, id: string): Promise<JobRow> {
      await this.get(userId, id);
      return prisma.job.update({
        where: { id },
        data: { overrides: Prisma.DbNull },
        include: { jdCache: true },
      });
    },

    /** ATS score of the user's vault (as a resume) against the job. */
    async match(userId: string, id: string): Promise<AtsScoreDto | null> {
      const job = await this.get(userId, id);
      const extraction = job.jdCache
        ? effectiveExtraction(job.jdCache.extracted, job.overrides)
        : null;
      if (!extraction) return null;
      const v = await prisma.vault.findUnique({ where: { userId }, select: { id: true } });
      if (!v) throw new AppError('NOT_FOUND', 'Build your vault first.', 404);
      const vault = await loadVault(prisma, { id: v.id });
      return scoreDto(vaultToAtsResume(vault!), extraction);
    },
  };
}
export type JobsService = ReturnType<typeof createJobsService>;

/** PRD F4: every new job lands in the tracker as Saved. */
async function saveToTracker(prisma: PrismaClient, userId: string, jobId: string, source: string) {
  await prisma.application.create({
    data: {
      userId,
      jobId,
      status: 'SAVED',
      statusHistory: [{ status: 'SAVED', at: new Date().toISOString() }],
      source: source === 'extension' ? 'extension' : 'manual',
    },
  });
}
