import type { AiClient } from '@tailor/ai';
import type { PrismaClient } from '@tailor/db';
import { runJdExtract } from './jd.js';
import { runGapQuestions, runVaultParse, type Requeue } from './vault.js';

export type BackgroundJobData =
  | { importId: string; requeued?: boolean }
  | { vaultId: string; userId: string }
  | { jobId: string; requeued?: boolean };

/** Run one background job by name. `requeue` schedules a single retry for high-demand errors. */
export async function runBackgroundJob(
  deps: { prisma: PrismaClient; ai: Pick<AiClient, 'run'> },
  name: string,
  data: BackgroundJobData,
  requeue: (name: string, data: BackgroundJobData, delayMs: number) => Promise<void>,
) {
  const again =
    (d: BackgroundJobData): Requeue =>
    (delay) =>
      requeue(name, { ...d, requeued: true }, delay);
  if (name === 'vault.parse' && 'importId' in data)
    return runVaultParse(deps, data.importId, again(data), data.requeued === true);
  if (name === 'vault.gapQuestions' && 'vaultId' in data) return runGapQuestions(deps, data);
  if (name === 'jd.extract' && 'jobId' in data)
    return runJdExtract(deps, data.jobId, again(data), data.requeued === true);
  throw new Error(`unknown background job ${name}`);
}
