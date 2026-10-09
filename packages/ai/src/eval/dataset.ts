import { JobExtraction, Region, RewriteSourceItem, Tone } from '@tailor/shared';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** One resume–JD pair for `resume.rewrite` evals: pre-selected vault items + extracted JD. */
export const RewritePair = z.object({
  id: z.string(),
  persona: z.string(),
  jd: JobExtraction,
  region: Region,
  tone: Tone.default('default'),
  pageTarget: z.union([z.literal(1), z.literal(2)]).default(1),
  profile: z.object({ name: z.string(), headline: z.string().default('') }),
  items: z.array(
    RewriteSourceItem.extend({
      startDate: z.string().nullish(),
      endDate: z.string().nullish(),
      variants: z.array(z.string()).default([]),
    }),
  ),
  /** Other vault names (other employers/titles/degrees) Fact Guard should watch for. */
  otherEntities: z
    .array(
      z.object({
        kind: z.enum(['company', 'title', 'degree', 'certification', 'institution']),
        name: z.string(),
      }),
    )
    .default([]),
});
export type RewritePair = z.infer<typeof RewritePair>;

/** Generic pair for other tasks: raw task input, generic metrics only. */
export const GenericPair = z.object({ id: z.string(), input: z.unknown() });
export type GenericPair = z.infer<typeof GenericPair>;

export function readJsonl<T extends z.ZodType>(path: string, schema: T): z.infer<T>[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'))
    .map((line, i) => {
      const r = schema.safeParse(JSON.parse(line));
      if (!r.success) throw new Error(`${path}:${i + 1}: ${r.error.issues[0]?.message}`);
      return r.data;
    });
}
