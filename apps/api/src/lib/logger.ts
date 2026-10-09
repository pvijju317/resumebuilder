import { pino, type Logger } from 'pino';
import type { ServerEnv } from '@tailor/shared/env';

/** Structured logs with no PII (CLAUDE.md): auth headers, cookies and emails are redacted. */
export function createLogger(env: Pick<ServerEnv, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.email',
        '*.code',
        '*.token',
        '*.accessToken',
      ],
      censor: '[redacted]',
    },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
