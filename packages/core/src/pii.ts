/**
 * PII tokenization (TRD §5.3): before any AI call, replace email addresses, phone numbers, URLs
 * and street-address lines with tokens; restore them afterwards. Names stay (needed for cover
 * letters; disclosed in consent). Deterministic and reversible.
 */

export type PiiKind = 'EMAIL' | 'PHONE' | 'URL' | 'ADDRESS';

export interface Tokenized {
  text: string;
  /** token -> original value, e.g. {{EMAIL_1}} -> asha@example.com */
  map: Record<string, string>;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// URLs with a scheme, www., or a bare well-known profile host (linkedin.com/in/x, github.com/x).
const URL =
  /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9-]+\.)*(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com)\/[^\s<>()]*/gi;
// Phones: optional +CC, 7-15 digits with spaces/dashes/dots/parentheses. Must contain ≥ 10 digits
// to avoid eating years or metrics ("2019-2023", "1,200,000").
const PHONE = /(?<![\w/])(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{2,5}(?![\w/])/g;
// A line that looks like a postal address: a PIN/ZIP code plus address words, or "Flat/House No".
const POSTAL = String.raw`(?:\b\d{6}\b|\b\d{5}(?:-\d{4})?\b|\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b)`;
const STREET_WORD = String.raw`\b(?:road|rd|street|st|lane|ln|nagar|colony|sector|block|flat|apartment|apt|house|avenue|ave|layout|cross|main|floor|marg|society)\b`;
const ADDRESS_LINE = new RegExp(
  // Postal code and a street word anywhere on the line (either order), or "Flat/House No …".
  String.raw`^(?=.*${POSTAL})(?=.*${STREET_WORD}).*$|^.*\b(?:flat|house|door|plot)\s*(?:no\.?|#)\s*\S+.*$`,
  'gim',
);

function digitsIn(s: string) {
  return s.replace(/\D/g, '').length;
}

export function tokenizePii(input: string): Tokenized {
  const map: Record<string, string> = {};
  const counters: Record<PiiKind, number> = { EMAIL: 0, PHONE: 0, URL: 0, ADDRESS: 0 };
  const seen = new Map<string, string>();
  const token = (kind: PiiKind, value: string) => {
    const existing = seen.get(`${kind}:${value}`);
    if (existing) return existing;
    const t = `{{${kind}_${++counters[kind]}}}`;
    map[t] = value;
    seen.set(`${kind}:${value}`, t);
    return t;
  };

  let text = input.replace(ADDRESS_LINE, (line) => token('ADDRESS', line.trim()));
  text = text.replace(EMAIL, (m) => token('EMAIL', m));
  text = text.replace(URL, (m) => {
    const trimmed = m.replace(/[.,;:]+$/, '');
    return token('URL', trimmed) + m.slice(trimmed.length);
  });
  text = text.replace(PHONE, (m) =>
    digitsIn(m) >= 10 && digitsIn(m) <= 15 ? token('PHONE', m.trim()) : m,
  );
  return { text, map };
}

const TOKEN = /\{\{(?:EMAIL|PHONE|URL|ADDRESS)_\d+\}\}/g;

/** Restore tokens in a string. Unknown tokens are left as-is. */
export function detokenize(text: string, map: Record<string, string>): string {
  return text.replace(TOKEN, (t) => map[t] ?? t);
}

/** Restore tokens everywhere inside a JSON-like value (AI output). */
export function detokenizeDeep<T>(value: T, map: Record<string, string>): T {
  if (typeof value === 'string') return detokenize(value, map) as T;
  if (Array.isArray(value)) return value.map((v) => detokenizeDeep(v, map)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, detokenizeDeep(v, map)]),
    ) as T;
  }
  return value;
}

export function containsPiiTokens(text: string): boolean {
  return new RegExp(TOKEN.source).test(text);
}
