import { createHash } from 'node:crypto';

/** Collapse whitespace and invisible characters so the same JD always hashes the same. */
export function normalizeJdText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cache key for JdCache.hash (case-insensitive on purpose). */
export function jdHash(text: string): string {
  return createHash('sha256').update(normalizeJdText(text).toLowerCase()).digest('hex');
}

const TRACKING =
  /^(utm_.+|gclid|fbclid|ref|refid|trk|trackingid|src|source|origin|lipi|currentjobid|recommendedflavor|ebp|from|position|pagenum)$/i;

/** Canonical job URL for JdCache.urlNorm: https, lowercase host, no hash, no tracking params, sorted query. */
export function normalizeJobUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  u.username = '';
  u.password = '';
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}
