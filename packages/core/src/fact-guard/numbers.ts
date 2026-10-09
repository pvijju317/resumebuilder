/**
 * Deterministic numeric-entity extraction for Fact Guard (TRD §6.3).
 * Recognises: 12 · 1,200,000 · 1,20,000 (Indian grouping) · 1.2M · ₹5 Cr · $3.4 million · 40+ ·
 * 63% · 63 percent · 3x · 2nd · spelled numbers two..ninety · years (2021).
 */

export type NumberKind = 'number' | 'percent' | `currency:${string}`;

export interface NumericEntity {
  /** Matched text as it appears. */
  raw: string;
  /** Fully expanded value (multipliers applied). */
  value: number;
  /** Number as written, before the multiplier (1.2 in "1.2M"). */
  written: number;
  multiplier: number;
  /** Decimal places as written (1 in "1.2M"). */
  decimals: number;
  /** Significant digits as written (2 in "1.2M", 1 in "5K"). */
  sigFigs: number;
  kind: NumberKind;
  /** "40+" — a lower bound. */
  plus: boolean;
}

const MULTIPLIERS: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  l: 1e5,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  millions: 1e6,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

const CURRENCY: Record<string, string> = {
  '₹': 'INR',
  rs: 'INR',
  'rs.': 'INR',
  inr: 'INR',
  $: 'USD',
  usd: 'USD',
  '£': 'GBP',
  gbp: 'GBP',
  '€': 'EUR',
  eur: 'EUR',
};

const NUMBER_WORDS: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  dozen: 12,
};

const MULT_ALT = Object.keys(MULTIPLIERS)
  .sort((a, b) => b.length - a.length)
  .join('|');

const NUMERIC_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,])` +
    String.raw`(?<cur>₹|\$|£|€|rs\.?|inr|usd|gbp|eur)?\s?` +
    String.raw`(?<num>\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)` +
    String.raw`(?:\s?(?<mult>${MULT_ALT})(?![\p{L}]))?` +
    String.raw`(?<pct>\s?%|\s?per\s?cent\b|\s?percent\b)?` +
    String.raw`(?<plus>\+)?` +
    // Attached units ("40s", "6ms", "2hrs", "500GB") so the number is still fact-checked.
    String.raw`(?<suffix>x|st|nd|rd|th|ms|s|hrs?|h|mins?|gb|tb|mb|kb)?` +
    String.raw`(?![\p{L}\p{N}])` +
    String.raw`(?:\s?(?<cur2>inr|usd|gbp|eur)\b)?`,
  'giu',
);

const WORD_RE = new RegExp(String.raw`\b(?<word>${Object.keys(NUMBER_WORDS).join('|')})\b`, 'gi');

function countDecimals(num: string): number {
  const dot = num.indexOf('.');
  return dot === -1 ? 0 : num.length - dot - 1;
}

function countSigFigs(num: string): number {
  const digits = num.replace(/[^\d]/g, '').replace(/^0+/, '');
  if (num.includes('.')) return digits.length;
  return digits.replace(/0+$/, '').length || 1;
}

/** Remove `[[ASK: …]]` spans so numbers inside questions are not fact-checked. */
export function stripAsks(text: string): string {
  return text.replace(/\[\[ASK:[^\]]*\]\]/gi, ' ');
}

export function extractNumbers(input: string): NumericEntity[] {
  const text = stripAsks(input);
  const out: NumericEntity[] = [];

  for (const m of text.matchAll(NUMERIC_RE)) {
    // Named groups always exist on a NUMERIC_RE match; `num` always participates.
    const g = m.groups!;
    const numStr = g['num']!.replace(/,/g, '');
    const written = Number(numStr);
    const multKey = g['mult']?.toLowerCase();
    const multiplier = multKey ? MULTIPLIERS[multKey]! : 1;
    const curKey = (g['cur'] ?? g['cur2'])?.toLowerCase();
    const currency = curKey ? CURRENCY[curKey.replace(/\s+$/, '')] : undefined;
    const kind: NumberKind = g['pct'] ? 'percent' : currency ? `currency:${currency}` : 'number';
    out.push({
      raw: m[0].trim(),
      value: written * multiplier,
      written,
      multiplier,
      decimals: countDecimals(numStr),
      sigFigs: countSigFigs(numStr),
      kind,
      plus: Boolean(g['plus']),
    });
  }

  for (const m of text.matchAll(WORD_RE)) {
    const value = NUMBER_WORDS[m.groups!['word']!.toLowerCase()]!;
    out.push({
      raw: m[0],
      value,
      written: value,
      multiplier: 1,
      decimals: 0,
      sigFigs: countSigFigs(String(value)),
      kind: 'number',
      plus: false,
    });
  }
  return out;
}

/** Is an output kind supported by a source kind? */
function kindCompatible(outKind: NumberKind, srcKind: NumberKind): boolean {
  if (outKind === 'percent') return srcKind === 'percent';
  if (outKind.startsWith('currency:')) return srcKind === outKind || srcKind === 'number';
  return true; // a bare output number may restate any sourced value
}

const EPS = 1e-9;

/**
 * True when `out` is supported by `src`:
 *  - same value (after multiplier expansion), or
 *  - an honest rounding/truncation of the source at the output's written precision, provided the
 *    output keeps ≥ 2 significant digits ("1.2M" from 1,234,567 — but not "2K" from 1,500), or
 *  - a lower bound ("40+") not exceeding the source value.
 */
export function numberSupported(out: NumericEntity, src: NumericEntity): boolean {
  if (!kindCompatible(out.kind, src.kind)) return false;
  if (Math.abs(out.value - src.value) <= EPS * Math.max(1, Math.abs(src.value))) return true;
  if (out.plus) return src.value >= out.value;
  if (out.sigFigs < 2) return false;
  const scaled = src.value / out.multiplier;
  const factor = 10 ** out.decimals;
  const rounded = Math.round(scaled * factor) / factor;
  const truncated = Math.trunc(scaled * factor) / factor;
  return Math.abs(rounded - out.written) < EPS || Math.abs(truncated - out.written) < EPS;
}
