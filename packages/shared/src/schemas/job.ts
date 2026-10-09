import { z } from 'zod';
import { Region, Seniority } from '../enums.js';

export const Keyword = z.object({
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().max(80)).default([]),
});
export type Keyword = z.infer<typeof Keyword>;

/** Output of the `jd.extract` AI task (cached in JdCache.extracted). */
export const JobExtraction = z.object({
  title: z.string().min(1).max(200),
  company: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  seniority: Seniority.default('unknown'),
  employmentType: z.string().max(40).nullish(),
  mustHave: z.array(Keyword).default([]),
  niceToHave: z.array(Keyword).default([]),
  responsibilities: z.array(z.string().max(400)).default([]),
  keywords: z.array(Keyword).default([]),
  yearsRequired: z
    .object({ min: z.number().min(0).nullish(), max: z.number().min(0).nullish() })
    .nullish(),
  education: z.array(z.string().max(200)).default([]),
  regionGuess: Region.nullish(),
});
export type JobExtraction = z.infer<typeof JobExtraction>;
