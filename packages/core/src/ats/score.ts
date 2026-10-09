import { containsPhrase, keywordForms, phrase, tokens } from './normalize.js';
import { isQuantified, type AtsResume } from './resume-text.js';

export interface AtsKeyword {
  name: string;
  aliases?: string[];
}

export interface AtsJob {
  title: string;
  mustHave: AtsKeyword[];
  niceToHave: AtsKeyword[];
}

/** TRD §6.1 component weights (sum 100). */
export const ATS_WEIGHTS = {
  mustHave: 40,
  niceToHave: 15,
  placement: 10,
  title: 10,
  quantified: 10,
  format: 10,
  sections: 5,
} as const;
/** Share of quantified bullets that earns full points. */
export const QUANTIFIED_FULL = 0.5;

export type MatchState = 'matched' | 'partial' | 'missing';
export interface KeywordResult {
  name: string;
  tier: 'must' | 'nice';
  state: MatchState;
  inBullets: boolean;
}

export interface AtsScore {
  score: number;
  parts: Record<keyof typeof ATS_WEIGHTS, number>;
  keywords: KeywordResult[];
  notes: string[];
}

const TITLE_STOP = new Set(['of', 'and', 'the', 'a', 'an', 'for', 'to', 'in', 'at', '&', 'with']);

function matchKeyword(
  k: AtsKeyword,
  all: string,
  bullets: string,
  skills: Set<string>,
): { state: MatchState; inBullets: boolean } {
  const forms = keywordForms(k.name, k.aliases);
  if (forms.some((f) => containsPhrase(all, f) || skills.has(f))) {
    return { state: 'matched', inBullets: forms.some((f) => containsPhrase(bullets, f)) };
  }
  // Partial: at least half of a multi-word keyword's tokens appear ("stakeholder management" vs "stakeholders").
  const allTokens = new Set(all.split(' '));
  const partial = forms.some((f) => {
    const t = f.split(' ').filter((x) => !TITLE_STOP.has(x));
    return t.length > 1 && t.filter((x) => allTokens.has(x)).length / t.length >= 0.5;
  });
  return { state: partial ? 'partial' : 'missing', inBullets: false };
}

const credit = (s: MatchState) => (s === 'matched' ? 1 : s === 'partial' ? 0.5 : 0);

/** Deterministic ATS fit estimate (TRD §6.1). No AI. */
export function atsScore(resume: AtsResume, job: AtsJob): AtsScore {
  const W = ATS_WEIGHTS;
  const all = phrase([resume.fullText, ...resume.skills].join('\n'));
  const bulletsText = phrase(resume.bullets.join('\n'));
  const skillSet = new Set(resume.skills.map(phrase));

  const must = job.mustHave.map((k) => ({
    name: k.name,
    tier: 'must' as const,
    ...matchKeyword(k, all, bulletsText, skillSet),
  }));
  const nice = job.niceToHave.map((k) => ({
    name: k.name,
    tier: 'nice' as const,
    ...matchKeyword(k, all, bulletsText, skillSet),
  }));

  const coverage = (ks: KeywordResult[]) =>
    ks.length === 0 ? 1 : ks.reduce((a, k) => a + credit(k.state), 0) / ks.length;
  const matchedMust = must.filter((k) => k.state === 'matched');
  const placement =
    matchedMust.length === 0
      ? 0
      : matchedMust.filter((k) => k.inBullets).length / matchedMust.length;

  const titleTokens = tokens(job.title).filter((t) => !TITLE_STOP.has(t));
  const titleCoverage = (text: string | null) => {
    if (!text || titleTokens.length === 0) return 0;
    const have = new Set(tokens(text));
    return titleTokens.filter((t) => have.has(t)).length / titleTokens.length;
  };
  const title = Math.max(
    titleCoverage(resume.recentTitle),
    titleCoverage(resume.headline),
    titleCoverage(resume.summary),
  );

  const quantRatio =
    resume.bullets.length === 0
      ? 0
      : resume.bullets.filter(isQuantified).length / resume.bullets.length;
  const formatChecks = Object.values(resume.format);
  const sectionChecks = Object.values(resume.sections);

  const parts = {
    mustHave: coverage(must) * W.mustHave,
    niceToHave: coverage(nice) * W.niceToHave,
    placement: placement * W.placement,
    title: Math.min(1, title) * W.title,
    quantified: Math.min(1, quantRatio / QUANTIFIED_FULL) * W.quantified,
    format: (formatChecks.filter(Boolean).length / formatChecks.length) * W.format,
    sections: (sectionChecks.filter(Boolean).length / sectionChecks.length) * W.sections,
  };
  const score = Math.max(
    0,
    Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0))),
  );

  const notes: string[] = [];
  const missingMust = must.filter((k) => k.state === 'missing').map((k) => k.name);
  if (missingMust.length) notes.push(`Missing required keywords: ${missingMust.join(', ')}.`);
  const onlyInSkills = matchedMust.filter((k) => !k.inBullets).map((k) => k.name);
  if (onlyInSkills.length)
    notes.push(`Show these in your experience, not only in skills: ${onlyInSkills.join(', ')}.`);
  if (title < 0.5) notes.push(`Your recent title or headline does not reflect "${job.title}".`);
  if (resume.bullets.length && quantRatio < QUANTIFIED_FULL) {
    notes.push(
      `${resume.bullets.filter(isQuantified).length} of ${resume.bullets.length} bullets include a number. Aim for at least half.`,
    );
  }
  if (!resume.format.singleColumn)
    notes.push(
      'Two-column layouts can be read out of order by some ATS. A single column is safer.',
    );
  if (!resume.format.contactPresent) notes.push('Add an email or phone number.');
  if (!resume.format.readableDates) notes.push('Use clear dates such as "Mar 2021" for each role.');
  for (const [k, ok] of Object.entries(resume.sections))
    if (!ok) notes.push(`Add a ${k[0]!.toUpperCase()}${k.slice(1)} section.`);

  return { score, parts, keywords: [...must, ...nice], notes };
}
