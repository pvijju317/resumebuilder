import { extractNumbers } from '../fact-guard/numbers.js';

/** What the ATS score needs from a resume, whether it comes from raw text or the vault. */
export interface AtsResume {
  headline: string | null;
  recentTitle: string | null;
  summary: string | null;
  bullets: string[];
  skills: string[];
  /** Everything, for keyword matching. */
  fullText: string;
  sections: { summary: boolean; experience: boolean; education: boolean; skills: boolean };
  format: {
    singleColumn: boolean;
    standardHeadings: boolean;
    readableDates: boolean;
    contactPresent: boolean;
    noTables: boolean;
  };
}

const HEADINGS: Record<keyof AtsResume['sections'] | 'projects' | 'other', RegExp> = {
  summary:
    /^(professional\s+)?(summary|profile|objective|about( me)?|career objective|personal statement)$/i,
  experience:
    /^(work\s+|professional\s+|relevant\s+)?(experience|employment( history)?|work history|career history)$/i,
  education:
    /^(education|academic( background| qualifications)?|qualifications|education and training)$/i,
  skills:
    /^(technical\s+|key\s+|core\s+)?(skills|competencies|core competencies|expertise|technologies|tools)$/i,
  projects: /^(academic\s+|personal\s+|key\s+)?projects$/i,
  other:
    /^(certifications?|awards?|languages|publications|volunteering|interests|achievements|contact|other)$/i,
};
type Section = keyof typeof HEADINGS;

const BULLET = /^\s*(?:[•●▪◦‣*·–—-]|\d+[.)])\s+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\{\{EMAIL_\d+\}\}/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,5}\d{2,5}|\{\{PHONE_\d+\}\}/;
const DATE =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b(?:0?[1-9]|1[0-2])\/\d{4}\b|\b\d{4}-(?:0[1-9]|1[0-2])\b|\b(?:19|20)\d{2}\s*[-to]+\s*(?:(?:19|20)\d{2}|present|current|now)\b/i;

function headingOf(line: string): Section | null {
  const clean = line.replace(/[:\s]+$/, '').trim();
  if (clean.length > 40) return null;
  for (const [k, re] of Object.entries(HEADINGS)) if (re.test(clean)) return k as Section;
  return null;
}

/**
 * Heuristic structure for raw resume text (anonymous score check). Deterministic; good enough to
 * find sections, bullets and skills in common single-column layouts.
 */
export function parseResumeText(text: string, layout: { twoColumn?: boolean } = {}): AtsResume {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const found: Partial<Record<Section, string[]>> = {};
  let current: Section | null = null;
  const preamble: string[] = [];
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      found[h] ??= [];
      continue;
    }
    if (current) found[current]!.push(line);
    else preamble.push(line);
  }

  const exp = [...(found.experience ?? []), ...(found.projects ?? [])];
  const bullets = exp
    .filter((l) => BULLET.test(l) || (l.length > 60 && !DATE.test(l)))
    .map((l) => l.replace(BULLET, '').trim());
  const skills = (found.skills ?? [])
    .flatMap((l) => l.replace(BULLET, '').split(/[,|;•·]/))
    .map((s) => s.replace(/^[^:]{1,30}:\s*/, '').trim())
    .filter((s) => s.length > 0 && s.length <= 40);
  const recentTitle =
    (found.experience ?? []).find((l) => !BULLET.test(l) && l.length <= 120) ?? null;
  const headline =
    preamble.find((l, i) => i > 0 && !EMAIL.test(l) && !PHONE.test(l) && l.length <= 80) ?? null;

  return {
    headline,
    recentTitle,
    summary: found.summary?.join(' ') || null,
    bullets,
    skills,
    fullText: text,
    sections: {
      summary: !!found.summary?.length,
      experience: !!found.experience?.length,
      education: !!found.education?.length,
      skills: !!found.skills?.length,
    },
    format: {
      singleColumn: !layout.twoColumn,
      standardHeadings: Object.keys(found).filter((k) => k !== 'other').length >= 3,
      readableDates: DATE.test(text),
      contactPresent: EMAIL.test(text) || PHONE.test(text),
      noTables: true,
    },
  };
}

/** A bullet counts as quantified if it has a number that is not just a year. */
export function isQuantified(bullet: string): boolean {
  return extractNumbers(bullet).some(
    (n) =>
      !(
        n.kind === 'number' &&
        n.multiplier === 1 &&
        n.decimals === 0 &&
        n.value >= 1950 &&
        n.value <= 2100
      ),
  );
}
