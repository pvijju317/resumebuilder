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
