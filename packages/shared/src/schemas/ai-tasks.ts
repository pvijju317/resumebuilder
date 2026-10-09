import { z } from 'zod';
import { Region, Tone } from '../enums.js';
import { JobExtraction } from './job.js';
import { RewriteSourceItem } from './resume.js';
import { Metric } from './vault.js';

/**
 * Inputs of every AI task (TRD §5.2). Outputs live next to their domain schemas
 * (VaultDraft, GapQuestions, JobExtraction, RewriteOutput, SectionPatch, DocPatch, ...).
 * All text is PII-tokenized before it reaches these schemas.
 */

/** Subset of core RegionRules the prompts need. */
export const PromptRegionRules = z.object({
  region: Region,
  documentLabel: z.string(),
  spelling: z.string(),
  statementLabel: z.string(),
});
export type PromptRegionRules = z.infer<typeof PromptRegionRules>;

export const VaultParseInput = z.object({ text: z.string().min(20).max(60_000) });

export const GapQuestionsInput = z.object({
  achievements: z
    .array(z.object({ id: z.string(), text: z.string(), metrics: z.array(Metric).default([]) }))
    .min(1),
  maxQuestions: z.number().int().min(1).max(8).default(8),
});

export const JdExtractInput = z.object({ text: z.string().min(50).max(40_000) });

export const RewriteInput = z.object({
  jd: JobExtraction,
  region: PromptRegionRules,
  tone: Tone,
  pageTarget: z.union([z.literal(1), z.literal(2)]),
  items: z.array(RewriteSourceItem).min(1),
});
export type RewriteInput = z.infer<typeof RewriteInput>;

export const RegenerateSectionInput = RewriteInput.extend({
  sectionId: z.string(),
  currentBullets: z.array(z.object({ sourceIds: z.array(z.string()), text: z.string() })),
});

export const RefineInput = RewriteInput.extend({
  instruction: z.string().min(3).max(300),
  summary: z.string().nullish(),
  currentBullets: z.array(z.object({ sourceIds: z.array(z.string()), text: z.string() })),
});

export const CoverLetterInput = z.object({
  jd: JobExtraction,
  region: PromptRegionRules,
  tone: z.enum(['professional', 'warm', 'direct']),
  candidateName: z.string(),
  items: z.array(RewriteSourceItem).min(1),
  wordRange: z.object({ min: z.number().int(), max: z.number().int() }),
});

export const AutofillAnswerInput = z.object({
  question: z.string().min(3).max(1000),
  jd: JobExtraction,
  candidateName: z.string(),
  items: z.array(RewriteSourceItem),
  maxWords: z.number().int().min(20).max(400).default(150),
});
