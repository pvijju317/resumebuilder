import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

const json = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .default('{}')
    .transform((s, ctx) => {
      try {
        return JSON.parse(s || '{}') as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
        return z.NEVER;
      }
    })
    .pipe(schema);

export const ProviderId = z.enum(['nvidia', 'deepinfra', 'openrouter', 'anthropic']);
export type ProviderId = z.infer<typeof ProviderId>;

/** AI-layer env. Switching provider/model is an env change only (CLAUDE.md rule 9). */
export const AiEnv = z.object({
  AI_PROVIDER_PRIMARY: ProviderId.default('nvidia'),
  AI_PROVIDER_FALLBACK: z
    .union([ProviderId, z.literal('')])
    .optional()
    .transform((v) => (v ? v : undefined)),
  NVIDIA_API_KEY: optional,
  NVIDIA_BASE_URL: z.url().default('https://integrate.api.nvidia.com/v1'),
  DEEPINFRA_API_KEY: optional,
  DEEPINFRA_BASE_URL: z.url().default('https://api.deepinfra.com/v1/openai'),
  OPENROUTER_API_KEY: optional,
  OPENROUTER_BASE_URL: z.url().default('https://openrouter.ai/api/v1'),
  ANTHROPIC_API_KEY: optional,
  AI_MODEL_STANDARD: z.string().min(1),
  AI_MODEL_PREMIUM: z.string().min(1),
  AI_FALLBACK_MODEL_STANDARD: optional,
  AI_FALLBACK_MODEL_PREMIUM: optional,
  AI_TASK_OVERRIDES: json(z.record(z.string(), z.string())),
  AI_RPM_LIMIT: z.coerce.number().int().positive().default(35),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  AI_DEBUG_LOG: bool,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
export type AiEnv = z.infer<typeof AiEnv>;

export const ServerEnv = AiEnv.extend({
  APP_NAME: z.string().default('Tailor'),
  APP_URL: z.url(),
  API_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EMAIL_TRANSPORT: z.enum(['smtp', 'ses', 'log']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SES_FROM: z.string().min(3),
  AWS_REGION: z.string().default('ap-south-1'),
  JWT_SECRET: z.string().min(32),
  REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ADMIN_EMAIL: z.email().optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
