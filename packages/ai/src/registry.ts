import {
  AutofillAnswerInput,
  AutofillAnswerOutput,
  CoverLetterInput,
  CoverLetterOutput,
  DocPatch,
  GapQuestions,
  GapQuestionsInput,
  JdExtractInput,
  JobExtraction,
  RefineInput,
  RegenerateSectionInput,
  RewriteInput,
  RewriteOutput,
  SectionPatch,
  VaultDraft,
  VaultParseInput,
} from '@tailor/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { z } from 'zod';

/** STANDARD/PREMIUM map to AI_MODEL_STANDARD/AI_MODEL_PREMIUM; BY_TIER follows the request tier. */
export type ModelClass = 'STANDARD' | 'PREMIUM' | 'BY_TIER';

export interface TaskDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  name: string;
  promptVersion: string;
  modelClass: ModelClass;
  maxTokens: number;
  temperature: number;
  input: I;
  output: O;
}

const def = <I extends z.ZodType, O extends z.ZodType>(t: TaskDef<I, O>) => t;

/** TRD §5.2 — every AI task the product is allowed to run. */
export const TASKS = {
  'vault.parse': def({
    name: 'vault.parse',
    promptVersion: 'v1',
    modelClass: 'PREMIUM',
    maxTokens: 6000,
    temperature: 0.1,
    input: VaultParseInput,
    output: VaultDraft,
  }),
  'vault.gapQuestions': def({
    name: 'vault.gapQuestions',
    promptVersion: 'v1',
    modelClass: 'STANDARD',
    maxTokens: 800,
    temperature: 0.3,
    input: GapQuestionsInput,
    output: GapQuestions,
  }),
  'jd.extract': def({
    name: 'jd.extract',
    promptVersion: 'v2',
    modelClass: 'STANDARD',
    maxTokens: 1200,
    temperature: 0,
    input: JdExtractInput,
    output: JobExtraction,
  }),
  'resume.rewrite': def({
    name: 'resume.rewrite',
    promptVersion: 'v1',
    modelClass: 'BY_TIER',
    maxTokens: 3000,
    temperature: 0.4,
    input: RewriteInput,
    output: RewriteOutput,
  }),
  'resume.regenerateSection': def({
    name: 'resume.regenerateSection',
    promptVersion: 'v1',
    modelClass: 'BY_TIER',
    maxTokens: 1500,
    temperature: 0.5,
    input: RegenerateSectionInput,
    output: SectionPatch,
  }),
  'resume.refine': def({
    name: 'resume.refine',
    promptVersion: 'v1',
    modelClass: 'BY_TIER',
    maxTokens: 2000,
    temperature: 0.4,
    input: RefineInput,
    output: DocPatch,
  }),
  'coverLetter.generate': def({
    name: 'coverLetter.generate',
    promptVersion: 'v1',
    modelClass: 'STANDARD',
    maxTokens: 900,
    temperature: 0.6,
    input: CoverLetterInput,
    output: CoverLetterOutput,
  }),
  'autofill.answer': def({
    name: 'autofill.answer',
    promptVersion: 'v1',
    modelClass: 'STANDARD',
    maxTokens: 400,
    temperature: 0.5,
    input: AutofillAnswerInput,
    output: AutofillAnswerOutput,
  }),
} as const;

export type TaskName = keyof typeof TASKS;
export type TaskInput<T extends TaskName> = z.input<(typeof TASKS)[T]['input']>;
export type TaskOutput<T extends TaskName> = z.infer<(typeof TASKS)[T]['output']>;

export const isTaskName = (s: string): s is TaskName => s in TASKS;

// AI_PROMPTS_DIR lets bundled deployments ship prompts next to the bundle.
const PROMPTS_DIR = process.env['AI_PROMPTS_DIR']
  ? resolve(process.cwd(), process.env['AI_PROMPTS_DIR'])
  : resolve(import.meta.dirname, '../prompts');
const cache = new Map<string, string>();

export function loadPrompt(task: string, version: string): string {
  const key = `${task}/${version}`;
  let text = cache.get(key);
  if (text === undefined) {
    text = readFileSync(resolve(PROMPTS_DIR, task, `${version}.md`), 'utf8');
    cache.set(key, text);
  }
  return text;
}
