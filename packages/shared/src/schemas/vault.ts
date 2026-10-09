import { z } from 'zod';
import { ImpactType } from '../enums.js';
import { YearMonth } from './common.js';

export const Metric = z.object({
  value: z.number(),
  unit: z.string().max(32), // "%", "INR", "users", "hours", ...
  context: z.string().max(200),
});
export type Metric = z.infer<typeof Metric>;

export const Link = z.object({
  kind: z.enum(['linkedin', 'github', 'portfolio', 'other']),
  url: z.string().max(500),
});

export const VaultProfile = z.object({
  name: z.string().max(120).default(''),
  email: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  location: z.string().max(120).nullish(),
  address: z.string().max(300).nullish(),
  headline: z.string().max(200).nullish(),
  links: z.array(Link).default([]),
  workAuth: z.string().max(200).nullish(),
});
export type VaultProfile = z.infer<typeof VaultProfile>;

/** Parse output: confidence 0..1 lets the review screen highlight weak fields. */
const Confidence = z.number().min(0).max(1);

export const DraftAchievement = z.object({
  text: z.string().min(1).max(600),
  metrics: z.array(Metric).default([]),
  skills: z.array(z.string().max(80)).default([]),
  impactType: z.array(ImpactType).default([]),
  confidence: Confidence.default(1),
});
export type DraftAchievement = z.infer<typeof DraftAchievement>;

export const DraftRole = z.object({
  company: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  location: z.string().max(120).nullish(),
  startDate: YearMonth.nullish(),
  endDate: YearMonth.nullish(), // null = present
  type: z.string().max(40).nullish(),
  teamSize: z.number().int().positive().nullish(),
  scope: z.string().max(500).nullish(),
  achievements: z.array(DraftAchievement).default([]),
  confidence: Confidence.default(1),
});

export const DraftProject = z.object({
  name: z.string().min(1).max(200),
  role: z.string().max(200).nullish(),
  url: z.string().max(500).nullish(),
  startDate: YearMonth.nullish(),
  endDate: YearMonth.nullish(),
  summary: z.string().max(600).nullish(),
  achievements: z.array(DraftAchievement).default([]),
  confidence: Confidence.default(1),
});

export const DraftEducation = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().max(200).nullish(),
  field: z.string().max(200).nullish(),
  startDate: YearMonth.nullish(),
  endDate: YearMonth.nullish(),
  grade: z.string().max(60).nullish(),
  confidence: Confidence.default(1),
});

export const DraftCertification = z.object({
  name: z.string().min(1).max(200),
  issuer: z.string().max(200).nullish(),
  date: YearMonth.nullish(),
  url: z.string().max(500).nullish(),
});

export const DraftSkill = z.object({
  name: z.string().min(1).max(80),
  category: z.string().max(60).nullish(),
  proficiency: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).nullish(),
  years: z.number().min(0).max(60).nullish(),
});

export const VaultExtras = z.object({
  languages: z
    .array(z.object({ name: z.string().max(60), level: z.string().max(40).nullish() }))
    .default([]),
  awards: z.array(z.object({ name: z.string().max(200), date: YearMonth.nullish() })).default([]),
  publications: z
    .array(z.object({ title: z.string().max(300), venue: z.string().max(200).nullish() }))
    .default([]),
  volunteering: z
    .array(z.object({ org: z.string().max(200), role: z.string().max(200).nullish() }))
    .default([]),
});
export type VaultExtras = z.infer<typeof VaultExtras>;

/** Output of the `vault.parse` AI task. */
export const VaultDraft = z.object({
  profile: VaultProfile,
  roles: z.array(DraftRole).default([]),
  projects: z.array(DraftProject).default([]),
  education: z.array(DraftEducation).default([]),
  certifications: z.array(DraftCertification).default([]),
  skills: z.array(DraftSkill).default([]),
  extras: VaultExtras.default({ languages: [], awards: [], publications: [], volunteering: [] }),
});
export type VaultDraft = z.infer<typeof VaultDraft>;

/** Output item of the `vault.gapQuestions` AI task. */
export const GapQuestion = z.object({
  achievementId: z.string(),
  question: z.string().min(5).max(300),
  expectedUnit: z.string().max(32).nullish(),
});
export const GapQuestions = z.object({ questions: z.array(GapQuestion).max(8) });
export type GapQuestion = z.infer<typeof GapQuestion>;
