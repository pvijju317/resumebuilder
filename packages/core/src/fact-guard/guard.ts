import { extractNumbers, numberSupported, stripAsks, type NumericEntity } from './numbers.js';
import {
  extractOrgLikeNames,
  isCheckable,
  mentions,
  normalizePhrase,
  type NamedEntity,
} from './names.js';

/** One vault item (achievement) plus the context it is allowed to cite. */
export interface GuardSource {
  id: string;
  text: string;
  /** User-confirmed alternative phrasings — valid revert targets. */
  variants?: string[];
  metrics?: Array<{ value: number; unit: string; context?: string }>;
  context: {
    company?: string | null;
    title?: string | null;
    projectName?: string | null;
    startDate?: string | null; // YYYY-MM
    endDate?: string | null; // YYYY-MM, null = present
  };
}

export interface GuardBulletInput {
  id: string;
  sourceIds: string[];
  text: string;
}

export interface GuardInput {
  bullets: GuardBulletInput[];
  summary?: string | null;
  /** Selected vault items, keyed by id. */
  sources: ReadonlyMap<string, GuardSource>;
  /** Every company/title/degree/cert/institution in the vault, plus foreign names (e.g. the JD company). */
  knownEntities: NamedEntity[];
  /** Profile facts any bullet may cite (name, headline). Contact data is tokenized upstream. */
  profileText?: string;
  /** For "present" end dates. Injected for determinism. */
  now?: Date;
}

export type ViolationType =
  'number' | 'company' | 'title' | 'degree' | 'certification' | 'institution' | 'unmapped';

export interface Violation {
  bulletId: string | 'summary';
  type: ViolationType;
  entity: string;
  outputText: string;
}

export interface AskPlaceholder {
  bulletId: string | 'summary';
  question: string;
}

export type BulletStatus = 'ok' | 'reverted' | 'dropped';

export interface GuardedBullet {
  id: string;
  sourceIds: string[];
  text: string;
  outputText: string;
  status: BulletStatus;
}

export interface GuardResult {
  bullets: GuardedBullet[];
  summary: string | null;
  violations: Violation[];
  asks: AskPlaceholder[];
  stats: { total: number; ok: number; reverted: number; dropped: number };
}

const ASK_RE = /\[\[ASK:\s*([^\]]+?)\s*\]\]/gi;

export function findAsks(text: string): string[] {
  return [...text.matchAll(ASK_RE)].map((m) => m[1]!.trim());
}

export function hasUnresolvedAsks(texts: Iterable<string>): boolean {
  for (const t of texts) if (findAsks(t).length > 0) return true;
  return false;
}

function metricEntities(metrics: GuardSource['metrics']): NumericEntity[] {
  return (metrics ?? []).map((m) => {
    const unit = m.unit.trim().toLowerCase();
    const kind =
      unit === '%' || unit === 'percent'
        ? 'percent'
        : ['inr', '₹', 'rs', 'rupees'].includes(unit)
          ? 'currency:INR'
          : ['usd', '$'].includes(unit)
            ? 'currency:USD'
            : ['gbp', '£'].includes(unit)
              ? 'currency:GBP'
              : ['eur', '€'].includes(unit)
                ? 'currency:EUR'
                : 'number';
    const s = String(m.value);
    return {
      raw: `${s}${m.unit}`,
      value: m.value,
      written: m.value,
      multiplier: 1,
      decimals: 0,
      sigFigs: s.length,
      kind,
      plus: false,
    } satisfies NumericEntity;
  });
}

function yearOf(ym: string | null | undefined): number | null {
  const y = ym ? Number(ym.slice(0, 4)) : NaN;
  return Number.isInteger(y) ? y : null;
}

function yearEntities(src: GuardSource, now: Date): NumericEntity[] {
  const start = yearOf(src.context.startDate);
  if (start === null) return [];
  const end =
    src.context.endDate === null || src.context.endDate === undefined
      ? now.getUTCFullYear()
      : (yearOf(src.context.endDate) ?? start);
  const out: NumericEntity[] = [];
  for (let y = start; y <= end; y++) {
    out.push({
      raw: String(y),
      value: y,
      written: y,
      multiplier: 1,
      decimals: 0,
      sigFigs: 4,
      kind: 'number',
      plus: false,
    });
  }
  return out;
}

interface Allowed {
  numbers: NumericEntity[];
  text: string;
}

function contextText(src: GuardSource): string {
  const c = src.context;
  return [c.company, c.title, c.projectName].filter(Boolean).join(' \n ');
}

function buildAllowed(sources: GuardSource[], profileText: string, now: Date): Allowed {
  const numbers: NumericEntity[] = extractNumbers(profileText);
  const texts: string[] = [profileText];
  for (const s of sources) {
    const all = [s.text, ...(s.variants ?? []), contextText(s)];
    texts.push(...all);
    for (const t of all) numbers.push(...extractNumbers(t));
    numbers.push(...metricEntities(s.metrics));
    for (const m of s.metrics ?? []) if (m.context) numbers.push(...extractNumbers(m.context));
    numbers.push(...yearEntities(s, now));
  }
  return { numbers, text: texts.join(' \n ') };
}

function checkText(
  bulletId: string | 'summary',
  output: string,
  allowed: Allowed,
  knownEntities: NamedEntity[],
): Violation[] {
  const text = stripAsks(output);
  const violations: Violation[] = [];

  for (const n of extractNumbers(text)) {
    if (!allowed.numbers.some((src) => numberSupported(n, src))) {
      violations.push({ bulletId, type: 'number', entity: n.raw, outputText: output });
    }
  }

  for (const e of knownEntities) {
    if (!isCheckable(e)) continue;
    if (mentions(text, e.name) && !mentions(allowed.text, e.name)) {
      violations.push({ bulletId, type: e.kind, entity: e.name, outputText: output });
    }
  }

  const reported = violations.map((v) => v.entity);
  for (const org of extractOrgLikeNames(text)) {
    const tails = phraseTails(org);
    const allowedOrg = tails.some((t) => mentions(allowed.text, t));
    const alreadyReported = reported.some((r) => tails.some((t) => mentions(r, t)));
    if (!allowedOrg && !alreadyReported) {
      violations.push({ bulletId, type: 'company', entity: org, outputText: output });
    }
  }
  return violations;
}

/**
 * "At Acme Labs" -> ["at acme labs", "acme labs"]: the org regex can swallow a leading
 * capitalised sentence word, so any trailing sub-phrase of ≥ 2 words may match the vault.
 */
function phraseTails(phrase: string): string[] {
  const words = normalizePhrase(phrase).split(' ');
  const tails: string[] = [];
  for (let i = 0; i <= words.length - 2; i++) tails.push(words.slice(i).join(' '));
  return tails;
}

function tokens(s: string): Set<string> {
  return new Set(normalizePhrase(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Closest user-confirmed phrasing (source text or a variant) to the rejected output. */
export function closestSourcePhrasing(output: string, sources: GuardSource[]): string {
  const out = tokens(output);
  let best = '';
  let bestScore = -1;
  for (const s of sources) {
    for (const candidate of [s.text, ...(s.variants ?? [])]) {
      const score = jaccard(out, tokens(candidate));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best;
}

function splitSentences(text: string): string[] {
  // Split only at terminal punctuation followed by whitespace and a capital/ASK marker, so
  // "1.2M", "Node.js" and "e.g. this" stay intact.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z[])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Fact Guard (TRD §6.3). Every number, currency amount, year, company, title, degree and
 * certification in the output must be supported by the mapped vault items. Offending bullets are
 * reverted to the closest confirmed phrasing; unmapped bullets are dropped; offending summary
 * sentences are removed. `[[ASK: …]]` markers are preserved and reported.
 */
export function factGuard(input: GuardInput): GuardResult {
  const now = input.now ?? new Date();
  const profileText = input.profileText ?? '';
  const violations: Violation[] = [];
  const asks: AskPlaceholder[] = [];
  const bullets: GuardedBullet[] = [];

  for (const b of input.bullets) {
    const sources = b.sourceIds.map((id) => input.sources.get(id));
    const known = sources.filter((s): s is GuardSource => s !== undefined);

    if (b.sourceIds.length === 0 || known.length !== sources.length) {
      violations.push({
        bulletId: b.id,
        type: 'unmapped',
        entity: b.sourceIds.join(',') || '(none)',
        outputText: b.text,
      });
      bullets.push({
        id: b.id,
        sourceIds: b.sourceIds,
        text: '',
        outputText: b.text,
        status: 'dropped',
      });
      continue;
    }

    const found = checkText(
      b.id,
      b.text,
      buildAllowed(known, profileText, now),
      input.knownEntities,
    );
    if (found.length > 0) {
      violations.push(...found);
      bullets.push({
        id: b.id,
        sourceIds: b.sourceIds,
        text: closestSourcePhrasing(b.text, known),
        outputText: b.text,
        status: 'reverted',
      });
      continue;
    }

    for (const q of findAsks(b.text)) asks.push({ bulletId: b.id, question: q });
    bullets.push({
      id: b.id,
      sourceIds: b.sourceIds,
      text: b.text,
      outputText: b.text,
      status: 'ok',
    });
  }

  let summary: string | null = null;
  if (input.summary) {
    const allowed = buildAllowed([...input.sources.values()], profileText, now);
    const kept: string[] = [];
    for (const sentence of splitSentences(input.summary)) {
      const found = checkText('summary', sentence, allowed, input.knownEntities);
      if (found.length > 0) {
        violations.push(...found);
        continue;
      }
      for (const q of findAsks(sentence)) asks.push({ bulletId: 'summary', question: q });
      kept.push(sentence);
    }
    summary = kept.length > 0 ? kept.join(' ') : null;
  }

  const count = (s: BulletStatus) => bullets.filter((x) => x.status === s).length;
  return {
    bullets,
    summary,
    violations,
    asks,
    stats: {
      total: bullets.length,
      ok: count('ok'),
      reverted: count('reverted'),
      dropped: count('dropped'),
    },
  };
}
