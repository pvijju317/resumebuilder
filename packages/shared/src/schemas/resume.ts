import { z } from 'zod';
import { Region, Tone } from '../enums.js';
import { Metric } from './vault.js';

export const ResumeBullet = z.object({
  id: z.string(),
  text: z.string().max(600),
  sourceIds: z.array(z.string()).min(1),
});
export type ResumeBullet = z.infer<typeof ResumeBullet>;

export const ResumeItem = z.object({
  id: z.string(),
  heading: z.string().nullish(),
  subheading: z.string().nullish(),
  dates: z.string().nullish(),
  location: z.string().nullish(),
  bullets: z.array(ResumeBullet).default([]),
});

export const ResumeSection = z.object({
  id: z.string(),
  type: z.enum([
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
    'awards',
    'publications',
    'volunteering',
    'custom',
  ]),
  title: z.string(),
  items: z.array(ResumeItem),
});
export type ResumeSection = z.infer<typeof ResumeSection>;

/** TRD §7 — single source for preview, PDF and DOCX. */
export const ResumeDoc = z.object({
  meta: z.object({
    region: Region,
    template: z.string(),
    pageTarget: z.union([z.literal(1), z.literal(2)]),
  }),
  header: z.object({
    name: z.string(),
    contacts: z.array(z.string()),
    links: z.array(z.string()),
  }),
  summary: z.string().nullish(),
  sections: z.array(ResumeSection),
  skills: z.array(z.object({ group: z.string().nullish(), items: z.array(z.string()) })),
});
export type ResumeDoc = z.infer<typeof ResumeDoc>;

/** A vault item as given to the rewrite prompt (PII already tokenized). */
export const RewriteSourceItem = z.object({
  id: z.string(),
  text: z.string(),
  metrics: z.array(Metric).default([]),
  skills: z.array(z.string()).default([]),
  context: z.object({
    kind: z.enum(['role', 'project']),
    company: z.string().nullish(),
    title: z.string().nullish(),
    name: z.string().nullish(),
    current: z.boolean().default(false),
  }),
});
export type RewriteSourceItem = z.infer<typeof RewriteSourceItem>;

/** Output of `resume.rewrite` — keyed by vault item id so Fact Guard can compare. */
export const RewriteOutput = z.object({
  summary: z.string().max(1200),
  bullets: z
    .array(
      z.object({
        sourceIds: z.array(z.string()).min(1),
        text: z.string().min(1).max(600),
      }),
    )
    .min(1),
  skillsOrder: z.array(z.string()).default([]),
});
export type RewriteOutput = z.infer<typeof RewriteOutput>;

export const SectionPatch = z.object({
  sectionId: z.string(),
  bullets: z.array(z.object({ sourceIds: z.array(z.string()).min(1), text: z.string().min(1) })),
});
export type SectionPatch = z.infer<typeof SectionPatch>;

export const DocPatch = z.object({
  summary: z.string().nullish(),
  bullets: z
    .array(z.object({ sourceIds: z.array(z.string()).min(1), text: z.string().min(1) }))
    .default([]),
});
export type DocPatch = z.infer<typeof DocPatch>;

export const CoverLetterOutput = z.object({ body: z.string().min(50).max(4000) });
export const AutofillAnswerOutput = z.object({ answer: z.string().min(1).max(2000) });

export const OptimizationOptions = z.object({
  region: Region,
  template: z.string(),
  pageTarget: z.union([z.literal(1), z.literal(2)]),
  tone: Tone.default('default'),
});
