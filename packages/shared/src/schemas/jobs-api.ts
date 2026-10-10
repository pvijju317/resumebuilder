import { z } from 'zod';
import { JobExtraction, Keyword } from './job.js';

export const CreateJobBody = z.union([
  z.object({ text: z.string().trim().min(200, 'Paste the full job description').max(40_000) }),
  z.object({ url: z.url('Enter a valid link').max(2000) }),
]);
export type CreateJobBody = z.infer<typeof CreateJobBody>;

export const JobOverrides = z.object({
  mustHave: z.array(Keyword).max(40).optional(),
  niceToHave: z.array(Keyword).max(40).optional(),
});
export type JobOverrides = z.infer<typeof JobOverrides>;

export const JobDto = z.object({
  id: z.string(),
  status: z.enum(['pending', 'ready', 'failed']),
  error: z.string().nullable(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  /** Extraction with the user's chip edits applied. */
  extraction: JobExtraction.nullable(),
  edited: z.boolean(),
  createdAt: z.string(),
});
export type JobDto = z.infer<typeof JobDto>;

export const AtsScoreDto = z.object({
  /** null: the job lists no skills to compare against (see notes). */
  score: z.number().int().nullable(),
  parts: z.record(z.string(), z.number()),
  keywords: z.array(
    z.object({
      name: z.string(),
      tier: z.enum(['must', 'nice']),
      state: z.enum(['matched', 'partial', 'missing']),
      inBullets: z.boolean(),
    }),
  ),
  notes: z.array(z.string()),
});
export type AtsScoreDto = z.infer<typeof AtsScoreDto>;

// ---------- Anonymous score check (PRD F1) ----------

export const AnonCheckBody = z.object({
  resume: z.union([
    z.object({ text: z.string().trim().min(200, 'Paste your full resume').max(60_000) }),
    z.object({ fileId: z.string().min(1) }),
  ]),
  job: CreateJobBody,
  turnstileToken: z.string().min(1, 'Please complete the check'),
  /** Optional client fingerprint; hashed server-side. */
  fingerprint: z.string().max(200).optional(),
});

export const AnonCheckDto = z.object({
  id: z.string(),
  status: z.enum(['pending', 'ready', 'failed']),
  error: z.string().nullable(),
  job: z.object({ title: z.string(), company: z.string().nullable() }).nullable(),
  ats: AtsScoreDto.nullable(),
  expiresAt: z.string(),
});
export type AnonCheckDto = z.infer<typeof AnonCheckDto>;

export const PublicConfig = z.object({ turnstileSiteKey: z.string().nullable() });
export type PublicConfig = z.infer<typeof PublicConfig>;
