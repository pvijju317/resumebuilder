import {
  buildAliasMap,
  factGuard,
  mentions,
  regionRules,
  skillKey,
  type GuardSource,
  type NamedEntity,
} from '@tailor/core';
import aliasSource from '@tailor/core/data/skill-aliases.json' with { type: 'json' };
import type { Keyword, RewriteOutput } from '@tailor/shared';
import type { RewritePair } from './dataset.js';

const aliasMap = buildAliasMap();
const canonicalAliases = aliasSource as Record<string, string[]>;

/** Max characters for a "two-line" bullet at body size on A4/Letter. */
export const BULLET_MAX_CHARS = 220;
export const SUMMARY_MAX_CHARS = 400;

function keywordForms(k: Keyword): string[] {
  const forms = new Set([k.name, ...k.aliases]);
  const canonical = skillKey(k.name, aliasMap);
  forms.add(canonical);
  for (const a of canonicalAliases[canonical] ?? []) forms.add(a);
  return [...forms];
}

const covers = (text: string, skills: string[], k: Keyword) => {
  const forms = keywordForms(k);
  const keys = new Set(skills.map((s) => skillKey(s, aliasMap)));
  return keys.has(skillKey(k.name, aliasMap)) || forms.some((f) => mentions(text, f));
};

export interface RewriteMetrics {
  bulletCount: number;
  expectedBullets: number;
  mustHaveSupported: number;
  mustHaveBefore: number;
  mustHaveAfter: number;
  /** Coverage of vault-supported must-haves in the output (0–1). */
  mustHaveCoverage: number;
  factGuardViolations: number;
  bulletsReverted: number;
  bulletsDropped: number;
  violationSamples: string[];
  asks: number;
  bulletsOverLength: number;
  summaryOverLength: boolean;
  firstPerson: number;
}

export function rewriteMetrics(pair: RewritePair, out: RewriteOutput): RewriteMetrics {
  const srcText = pair.items.map((i) => i.text).join('\n');
  const srcSkills = pair.items.flatMap((i) => i.skills);
  const outText = [out.summary, ...out.bullets.map((b) => b.text)].join('\n');
  const outSkills = out.skillsOrder;

  const supported = pair.jd.mustHave.filter((k) => covers(srcText, srcSkills, k));
  const before = pair.jd.mustHave.filter(
    (k) => mentions(srcText, k.name) || keywordForms(k).some((f) => mentions(srcText, f)),
  );
  const after = supported.filter((k) => covers(outText, outSkills, k));

  const sources = new Map<string, GuardSource>(
    pair.items.map((i) => [
      i.id,
      {
        id: i.id,
        text: i.text,
        variants: i.variants,
        metrics: i.metrics,
        context: {
          company: i.context.company,
          title: i.context.title,
          projectName: i.context.name,
          startDate: i.startDate,
          endDate: i.endDate,
        },
      },
    ]),
  );
  const knownEntities: NamedEntity[] = [
    ...pair.items.flatMap((i): NamedEntity[] => [
      ...(i.context.company ? [{ kind: 'company' as const, name: i.context.company }] : []),
      ...(i.context.title ? [{ kind: 'title' as const, name: i.context.title }] : []),
    ]),
    ...pair.otherEntities,
    ...(pair.jd.company ? [{ kind: 'company' as const, name: pair.jd.company }] : []),
  ];
  const guard = factGuard({
    bullets: out.bullets.map((b, i) => ({ id: `b${i}`, sourceIds: b.sourceIds, text: b.text })),
    summary: out.summary,
    sources,
    knownEntities,
    profileText: `${pair.profile.name} ${pair.profile.headline}`,
  });

  return {
    bulletCount: out.bullets.length,
    expectedBullets: pair.items.length,
    mustHaveSupported: supported.length,
    mustHaveBefore: before.length,
    mustHaveAfter: after.length,
    mustHaveCoverage: supported.length === 0 ? 1 : after.length / supported.length,
    factGuardViolations: guard.violations.length,
    bulletsReverted: guard.stats.reverted,
    bulletsDropped: guard.stats.dropped,
    violationSamples: guard.violations.slice(0, 5).map((v) => `${v.type}: ${v.entity}`),
    asks: guard.asks.length,
    bulletsOverLength: out.bullets.filter((b) => b.text.length > BULLET_MAX_CHARS).length,
    summaryOverLength: out.summary.length > SUMMARY_MAX_CHARS,
    firstPerson: out.bullets.filter((b) => /\b(I|my|me)\b/.test(b.text)).length,
  };
}

/** Region rules as passed to prompts. */
export function promptRegion(region: RewritePair['region']) {
  const r = regionRules(region);
  return {
    region: r.region,
    documentLabel: r.documentLabel,
    spelling: r.spelling,
    statementLabel: r.statementLabel,
  };
}
