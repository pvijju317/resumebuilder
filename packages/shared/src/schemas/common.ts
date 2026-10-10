import { z } from 'zod';

/**
 * Vault dates are `YYYY-MM`, or `YYYY` when the source gives only a year (CLAUDE.md code
 * conventions). Never fill in a month the user did not give: it would be an invented fact.
 */
export const YearMonth = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Expected YYYY-MM or YYYY');
export type YearMonth = z.infer<typeof YearMonth>;

export const Cuid = z.string().min(1).max(64);
