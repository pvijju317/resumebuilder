import { parseEnv, AiEnv } from '@tailor/shared/env';
import type { CallLogEntry, CallLogSink } from '../src/client.js';
import type { CompletionRequest, CompletionResponse, LLMProvider } from '../src/types.js';

export const testEnv = (over: Record<string, string> = {}) =>
  parseEnv(AiEnv, {
    AI_PROVIDER_PRIMARY: 'nvidia',
    AI_MODEL_STANDARD: 'nvidia/nemotron-3-super-120b-a12b',
    AI_MODEL_PREMIUM: 'nvidia/nemotron-3-ultra-550b-a55b',
    NVIDIA_API_KEY: 'test',
    NODE_ENV: 'test',
    ...over,
  });

type Step = string | Error | ((req: CompletionRequest) => string | Error);

/** Scripted provider: each call consumes the next step (text => success, Error => throw). */
export function scriptedProvider(id: string, steps: Step[]) {
  const requests: CompletionRequest[] = [];
  const provider: LLMProvider = {
    id,
    async complete(req): Promise<CompletionResponse> {
      requests.push(req);
      const step = steps.shift();
      if (step === undefined) throw new Error(`${id}: no scripted step left`);
      const value = typeof step === 'function' ? step(req) : step;
      if (value instanceof Error) throw value;
      return { text: value, inputTokens: 100, outputTokens: 50, raw: {} };
    },
  };
  return { provider, requests };
}

export function memorySink() {
  const entries: CallLogEntry[] = [];
  const sink: CallLogSink = { record: async (e) => void entries.push(e) };
  return { sink, entries };
}

export const noLimit = { acquire: async () => undefined };

export const jd = {
  title: 'Data Analyst',
  company: 'Fabrikam',
  seniority: 'mid' as const,
  mustHave: [{ name: 'Python', aliases: [] }],
  niceToHave: [],
  responsibilities: [],
  keywords: [],
  education: [],
};

export const rewriteInput = {
  jd,
  region: {
    region: 'IN' as const,
    documentLabel: 'Resume',
    spelling: 'en-IN',
    statementLabel: 'Summary',
  },
  tone: 'default' as const,
  pageTarget: 1 as const,
  items: [
    {
      id: 'a1',
      text: 'Automated reporting with Python, cutting manual effort by 63%',
      metrics: [],
      skills: ['python'],
      context: { kind: 'role' as const, company: 'Northwind', title: 'Analyst', current: true },
    },
  ],
};

export const validRewrite = JSON.stringify({
  summary: 'Analyst who automates reporting in Python.',
  bullets: [{ sourceIds: ['a1'], text: 'Automate reporting in Python, cutting manual effort 63%' }],
  skillsOrder: ['python'],
});
