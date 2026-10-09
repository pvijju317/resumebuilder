import { AppError, type Tier } from '@tailor/shared';
import type { AiClient, TaskName } from '@tailor/ai';

export const QUEUES = { ai: 'ai' } as const;

/** BullMQ priority: lower runs first. Power plan jobs jump the queue (TRD §5.3). */
export const PRIORITY = { priority: 1, normal: 5 } as const;

export interface AiJobData {
  task: TaskName;
  input: unknown;
  tier?: Tier;
  userId?: string;
  refId?: string;
  /** Set when the job was re-queued after a high-demand failure. */
  requeued?: boolean;
}

export type Requeue = (data: AiJobData, delayMs: number) => Promise<void>;

/** Delay before the single automatic requeue on AI_UNAVAILABLE. */
export const REQUEUE_DELAY_MS = 30_000;

/**
 * Runs one AI job. On "high demand" the job is re-queued exactly once (TRD §5.3); any other
 * failure — or a second high-demand failure — propagates so the caller can refund and notify.
 */
export async function processAiJob(client: AiClient, data: AiJobData, requeue: Requeue) {
  try {
    const r = await client.run(data.task, data.input as never, {
      tier: data.tier,
      userId: data.userId,
      refId: data.refId,
    });
    return { output: r.output, model: r.model, provider: r.provider, latencyMs: r.latencyMs };
  } catch (e) {
    if (e instanceof AppError && e.code === 'AI_UNAVAILABLE' && !data.requeued) {
      await requeue({ ...data, requeued: true }, REQUEUE_DELAY_MS);
      return { requeued: true as const };
    }
    throw e;
  }
}
