import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const hmac = (secret: string, s: string) =>
  createHmac('sha256', secret).update(s).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const sixDigitCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Hash IPs before using them as rate-limit keys so raw IPs never land in Redis. */
export const ipKey = (ip: string | undefined) => sha256(ip ?? 'unknown').slice(0, 24);
