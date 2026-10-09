import { extractNumbers } from './fact-guard/numbers.js';

export interface MetricLike {
  value: number;
  unit: string;
  context: string;
}

export interface AchievementLike {
  id: string;
  text: string;
  metrics: MetricLike[];
  skills: string[];
  hidden?: boolean;
  order: number;
}

export interface RoleLike {
  id: string;
  startDate: string | null;
  endDate: string | null;
  hidden?: boolean;
  order: number;
  achievements: AchievementLike[];
}

export interface StrengthInput {
  profile: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    headline?: string | null;
    links?: unknown[];
  };
  roles: RoleLike[];
  projects: { achievements: AchievementLike[]; hidden?: boolean }[];
  educationCount: number;
  skillsCount: number;
}

/** Vault strength weights (sum 100). Metrics dominate: PRD F3 "increases as metrics are added". */
export const STRENGTH_WEIGHTS = {
  profile: 15,
  experience: 15,
  quantified: 40,
  skills: 15,
  education: 10,
  skillTagged: 5,
} as const;

/** Share of achievements with a metric that earns full "quantified" points. */
export const QUANTIFIED_TARGET = 0.6;

const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

function visibleAchievements(v: StrengthInput): AchievementLike[] {
  return [
    ...v.roles.filter((r) => !r.hidden).flatMap((r) => r.achievements),
    ...v.projects.filter((p) => !p.hidden).flatMap((p) => p.achievements),
  ].filter((a) => !a.hidden);
}

export interface StrengthBreakdown {
  score: number;
  parts: Record<keyof typeof STRENGTH_WEIGHTS, number>;
}

/** Deterministic vault strength, 0–100. */
export function vaultStrength(v: StrengthInput): StrengthBreakdown {
  const W = STRENGTH_WEIGHTS;
  const p = v.profile;
  const profileChecks = [
    filled(p.name),
    filled(p.email),
    filled(p.phone),
    filled(p.location),
    filled(p.headline),
    (p.links?.length ?? 0) > 0,
  ];
  const profile = (profileChecks.filter(Boolean).length / profileChecks.length) * W.profile;

  const roles = v.roles.filter((r) => !r.hidden);
  const ach = visibleAchievements(v);
  const hasExperience = roles.length > 0 || v.projects.some((x) => !x.hidden);
  const datedRoles =
    roles.length === 0 ? 1 : roles.filter((r) => filled(r.startDate)).length / roles.length;
  const avgPerRole =
    roles.length === 0 ? (ach.length > 0 ? 1 : 0) : Math.min(1, ach.length / roles.length / 3);
  const experience = hasExperience ? (W.experience / 3) * (1 + datedRoles + avgPerRole) : 0;

  const withMetric =
    ach.length === 0 ? 0 : ach.filter((a) => a.metrics.length > 0).length / ach.length;
  const quantified = Math.min(1, withMetric / QUANTIFIED_TARGET) * W.quantified;
  const skills = Math.min(1, v.skillsCount / 10) * W.skills;
  const education = v.educationCount > 0 ? W.education : 0;
  const skillTagged =
    ach.length === 0
      ? 0
      : (ach.filter((a) => a.skills.length > 0).length / ach.length) * W.skillTagged;

  const parts = { profile, experience, quantified, skills, education, skillTagged };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { score: Math.max(0, Math.min(100, score)), parts };
}

/**
 * Which achievements get gap questions: visible, unquantified, most recent role first, then
 * projects; capped at `max` (PRD: up to 8).
 */
export function selectGapCandidates(
  v: Pick<StrengthInput, 'roles' | 'projects'>,
  max = 8,
): AchievementLike[] {
  const byRecency = [...v.roles]
    .filter((r) => !r.hidden)
    .sort((a, b) => {
      const ea = a.endDate ?? '9999-12';
      const eb = b.endDate ?? '9999-12';
      return ea === eb
        ? (b.startDate ?? '').localeCompare(a.startDate ?? '')
        : eb.localeCompare(ea);
    });
  const ordered = [
    ...byRecency.flatMap((r) => [...r.achievements].sort((a, b) => a.order - b.order)),
    ...v.projects
      .filter((p) => !p.hidden)
      .flatMap((p) => [...p.achievements].sort((a, b) => a.order - b.order)),
  ];
  return ordered.filter((a) => !a.hidden && a.metrics.length === 0).slice(0, max);
}

const UNIT_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'per',
  'about',
  'around',
  'and',
  'or',
  'to',
  'in',
  'on',
  'for',
  'with',
  'by',
]);

/**
 * Turn a free-text gap answer into metrics, deterministically ("About 120 store managers" →
 * {value: 120, unit: "store managers"}). Answers without numbers produce no metrics.
 */
export function answerToMetrics(
  answer: string,
  opts: { context: string; expectedUnit?: string | null },
): MetricLike[] {
  const text = answer.trim();
  const nums = extractNumbers(text);
  return nums.map((n) => {
    let unit: string;
    if (n.kind === 'percent') unit = '%';
    else if (n.kind.startsWith('currency:')) unit = n.kind.slice('currency:'.length);
    else {
      const after = text.slice(text.indexOf(n.raw) + n.raw.length);
      const words = after
        .split(/[^\p{L}-]+/u)
        .filter(Boolean)
        .slice(0, 3);
      const firstContent = words.findIndex((w) => !UNIT_STOPWORDS.has(w.toLowerCase()));
      const picked =
        firstContent === -1
          ? []
          : words
              .slice(firstContent, firstContent + 2)
              .filter((w) => !UNIT_STOPWORDS.has(w.toLowerCase()));
      unit = picked.join(' ').toLowerCase() || opts.expectedUnit?.trim() || '';
    }
    return { value: n.value, unit: unit.slice(0, 32), context: opts.context.slice(0, 200) };
  });
}
