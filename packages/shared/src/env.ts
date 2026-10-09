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
  /** Token-bucket capacity. Worst case per 60 s window = RPM + burst, so keep it small. */
  AI_RPM_BURST: z.coerce.number().int().positive().default(3),
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
  /** smtp: Mailpit in dev, SES SMTP interface in prod. log: print OTPs to the console (dev only). */
  EMAIL_TRANSPORT: z.enum(['smtp', 'log']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: bool,
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SES_FROM: z.string().min(3),
  AWS_REGION: z.string().default('ap-south-1'),
  /** disk: local temp folder (dev only, files auto-deleted); s3: S3-compatible (Cloudflare R2). */
  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  STORAGE_DISK_DIR: z.string().default('.local-storage'),
  /** Raw uploads are deleted after this many hours (only extracted text is kept). */
  FILE_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  /** S3-compatible object storage. Cloudflare R2: endpoint https://<account>.r2.cloudflarestorage.com, region auto. */
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: bool,
  FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  JWT_SECRET: z.string().min(32),
  REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  TURNSTILE_SITE_KEY: optional,
  TURNSTILE_SECRET: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ADMIN_EMAIL: z.email().optional(),
  /** TRD §10 rate limits (per IP for auth, per user for API). */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(5),
  OTP_REQUESTS_PER_EMAIL_PER_HOUR: z.coerce.number().int().positive().default(5),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  /** Each vault build is one premium AI call. */
  VAULT_BUILDS_PER_HOUR: z.coerce.number().int().positive().default(10),
  /** New jobs per user per hour (each uncached JD costs one AI call). */
  JOBS_PER_HOUR: z.coerce.number().int().positive().default(30),
  /** Anonymous score checks per IP per 24 h (PRD F1 abuse limits). */
  ANON_CHECKS_PER_IP_PER_DAY: z.coerce.number().int().positive().default(10),
  ANON_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),
  /** Comma-separated origins allowed by CORS (the web app is same-origin via proxy). */
  CORS_ORIGINS: z.string().default(''),
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
