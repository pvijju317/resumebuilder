import { z } from 'zod';

/** Vault dates are `YYYY-MM` (CLAUDE.md code conventions). */
export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export type YearMonth = z.infer<typeof YearMonth>;

export const Cuid = z.string().min(1).max(64);
