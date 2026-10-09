import { AppError } from '@tailor/shared';
import type { AiClient } from '@tailor/ai';
import { describe, expect, it, vi } from 'vitest';
import { estimateCostUsd } from '@tailor/jobs';
import { REQUEUE_DELAY_MS, processAiJob, type AiJobData } from '../src/queues.js';

const job: AiJobData = { task: 'jd.extract', input: { text: 'x' }, userId: 'u1' };
const clientThat = (run: () => Promise<unknown>) => ({ run: vi.fn(run) }) as unknown as AiClient;

describe('processAiJob', () => {
  it('returns the task output', async () => {
    const c = clientThat(async () => ({
      output: { ok: 1 },
      model: 'm',
      provider: 'nvidia',
      latencyMs: 10,
    }));
    await expect(processAiJob(c, job, vi.fn())).resolves.toEqual({
      output: { ok: 1 },
      model: 'm',
      provider: 'nvidia',
      latencyMs: 10,
    });
  });

  it('requeues exactly once on high demand', async () => {
    const busy = () => Promise.reject(new AppError('AI_UNAVAILABLE', 'High demand', 503));
    const requeue = vi.fn(async () => undefined);
    await expect(processAiJob(clientThat(busy), job, requeue)).resolves.toEqual({ requeued: true });
    expect(requeue).toHaveBeenCalledWith({ ...job, requeued: true }, REQUEUE_DELAY_MS);
    await expect(
      processAiJob(clientThat(busy), { ...job, requeued: true }, requeue),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(requeue).toHaveBeenCalledTimes(1);
  });

  it('does not requeue other failures', async () => {
    const requeue = vi.fn();
    const bad = () => Promise.reject(new AppError('AI_INVALID_OUTPUT', 'bad', 502));
    await expect(processAiJob(clientThat(bad), job, requeue)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    expect(requeue).not.toHaveBeenCalled();
  });
});

describe('estimateCostUsd', () => {
  it('prices per million tokens and treats unknown models as free', () => {
    expect(
      estimateCostUsd(
        { inputTokens: 1_000_000, outputTokens: 500_000 },
        { input: 0.1, output: 0.4 },
      ),
    ).toBeCloseTo(0.3);
    expect(estimateCostUsd({ inputTokens: 10, outputTokens: 10 }, undefined)).toBe(0);
  });
});
