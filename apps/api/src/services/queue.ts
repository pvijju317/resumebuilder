import { QUEUE_NAMES } from '@tailor/shared';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

/** Background jobs the API hands to the worker. Names match apps/worker processors. */
export type BackgroundJob =
  | { name: 'vault.parse'; data: { importId: string } }
  | { name: 'vault.gapQuestions'; data: { vaultId: string; userId: string } }
  | { name: 'jd.extract'; data: { jobId: string } };

export interface JobQueue {
  enqueue(job: BackgroundJob): Promise<void>;
}

export function createBullQueue(connection: Redis): JobQueue & { close(): Promise<void> } {
  const q = new Queue(QUEUE_NAMES.background, { connection });
  return {
    async enqueue(job) {
      await q.add(job.name, job.data, {
        attempts: 1,
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86_400 },
      });
    },
    close: () => q.close(),
  };
}

export class MemoryQueue implements JobQueue {
  readonly jobs: BackgroundJob[] = [];
  async enqueue(job: BackgroundJob) {
    this.jobs.push(job);
  }
}

/**
 * Runs jobs in this process after the response (serverless, no worker). `schedule` keeps the
 * platform alive until the promise settles (Vercel `waitUntil`); a high-demand failure is retried
 * once after its delay, inside the same scheduled promise.
 */
export class InlineQueue implements JobQueue {
  constructor(
    private readonly run: (
      name: string,
      data: BackgroundJob['data'],
      requeue: (name: string, data: BackgroundJob['data'], delayMs: number) => Promise<void>,
    ) => Promise<unknown>,
    private readonly schedule: (p: Promise<unknown>) => void,
    private readonly onError: (err: unknown, job: string) => void,
  ) {}

  async enqueue(job: BackgroundJob) {
    const exec = (name: string, data: BackgroundJob['data']): Promise<unknown> =>
      this.run(name, data, (n, d, delayMs) =>
        new Promise<void>((r) => setTimeout(r, delayMs)).then(() =>
          exec(n, d).then(() => undefined),
        ),
      );
    this.schedule(exec(job.name, job.data).catch((err) => this.onError(err, job.name)));
  }
}
