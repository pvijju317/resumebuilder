import { jdHash, normalizeJobUrl } from '@tailor/core/ats';
import type { PrismaClient } from '@tailor/db';
import { AppError } from '@tailor/shared';
import type { AiClient } from '@tailor/ai';
import type { Requeue } from './vault.js';

export const JD_FAILED_MESSAGE =
  'We could not read that job description. Try pasting the full text.';

/** Extract a pending job's JD once and share it through JdCache (cache keyed by hash and URL). */
export async function runJdExtract(
  deps: { prisma: PrismaClient; ai: Pick<AiClient, 'run'> },
  jobId: string,
  requeue: Requeue,
  alreadyRequeued: boolean,
) {
  const { prisma, ai } = deps;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'pending' || !job.rawText) return { skipped: true };
  const hash = jdHash(job.rawText);
  const urlNorm = job.sourceUrl ? normalizeJobUrl(job.sourceUrl) : null;

  // Another user may have extracted the same JD meanwhile.
  const cached = await prisma.jdCache.findUnique({ where: { hash } });
  if (cached) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'ready', jdCacheId: cached.id, rawText: null },
    });
    return { status: 'ready' as const, cached: true };
  }

  try {
    const r = await ai.run(
      'jd.extract',
      { text: job.rawText },
      { userId: job.userId ?? undefined, refId: jobId },
    );
    const urlTaken = urlNorm ? await prisma.jdCache.findUnique({ where: { urlNorm } }) : null;
    const entry = await prisma.jdCache.upsert({
      where: { hash },
      create: {
        hash,
        urlNorm: urlTaken ? null : urlNorm,
        raw: job.rawText,
        extracted: r.output,
        model: r.model,
      },
      update: {},
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'ready', jdCacheId: entry.id, rawText: null, error: null },
    });
    return { status: 'ready' as const, cached: false };
  } catch (e) {
    if (e instanceof AppError && e.code === 'AI_UNAVAILABLE' && !alreadyRequeued) {
      await requeue(30_000);
      return { status: 'requeued' as const };
    }
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', error: JD_FAILED_MESSAGE },
    });
    return { status: 'failed' as const, error: e };
  }
}
