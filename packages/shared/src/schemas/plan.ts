import { z } from 'zod';

/** Plan.features JSON. All limits live in the DB (PRD F12), never in code. */
export const PlanFeatures = z.object({
  editor: z.boolean(),
  coverLetters: z.boolean(),
  autofill: z.boolean(),
  priorityQueue: z.boolean(),
  extensionMatchScore: z.boolean(),
  tracker: z.boolean(),
  includedPerOptimization: z.object({
    coverLetters: z.number().int().min(0),
    regenerates: z.number().int().min(0),
    refines: z.number().int().min(0),
  }),
  /** Starter: credits valid for N days instead of monthly reset. */
  validityDays: z.number().int().positive().nullish(),
});
export type PlanFeatures = z.infer<typeof PlanFeatures>;
