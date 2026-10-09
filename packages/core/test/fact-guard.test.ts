import { describe, expect, it } from 'vitest';
import {
  closestSourcePhrasing,
  factGuard,
  findAsks,
  hasUnresolvedAsks,
  type GuardInput,
  type GuardSource,
} from '../src/fact-guard/guard.js';
import { extractOrgLikeNames, isCheckable, mentions } from '../src/fact-guard/names.js';

const NOW = new Date('2026-10-01T00:00:00Z');

const sources: GuardSource[] = [
  {
    id: 'a1',
    text: 'Automated monthly reporting with Python, cutting manual effort by 63%',
    variants: ['Led automation of reporting, saving 63% of analyst time'],
    metrics: [{ value: 40, unit: 'dashboards', context: 'used by 120 managers' }],
    context: {
      company: 'Northwind Analytics',
      title: 'Senior Data Analyst',
      startDate: '2022-04',
      endDate: null,
    },
  },
  {
    id: 'a2',
    text: 'Grew pipeline to ₹5 Cr through partner channel',
    metrics: [{ value: 18, unit: '%', context: 'win rate' }],
    context: {
      company: 'Contoso Retail',
      title: 'Business Analyst',
      startDate: '2019-07',
      endDate: '2022-03',
    },
  },
  {
    id: 'p1',
    text: 'Built a churn model for a telecom dataset',
    metrics: [{ value: 5000000, unit: 'INR', context: 'budget' }],
    context: { projectName: 'Churn Radar', startDate: '2021-01', endDate: '2021-06' },
  },
  {
    id: 'a3',
    text: 'Owned vendor onboarding',
    context: {},
  },
];

const base = (over: Partial<GuardInput> = {}): GuardInput => ({
  bullets: [],
  sources: new Map(sources.map((s) => [s.id, s])),
  knownEntities: [
    { kind: 'company', name: 'Northwind Analytics' },
    { kind: 'company', name: 'Contoso Retail' },
    { kind: 'company', name: 'Fabrikam' }, // JD company — never claimable
    { kind: 'title', name: 'Senior Data Analyst' },
    { kind: 'title', name: 'Business Analyst' },
    { kind: 'title', name: 'Analyst' }, // single word: not checked
    { kind: 'degree', name: 'MBA' },
    { kind: 'certification', name: 'AWS Certified Solutions Architect' },
    { kind: 'institution', name: 'IIT Bombay' },
  ],
  profileText: 'Asha Rao — Data analyst',
  now: NOW,
  ...over,
});

const bullet = (text: string, sourceIds = ['a1'], id = 'b1') => ({ id, sourceIds, text });

describe('factGuard — bullets', () => {
  it('passes a truthful rewrite that restates sourced facts', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet(
            'Automated Python reporting for 120 managers across 40 dashboards, reducing manual effort 63%',
          ),
        ],
      }),
    );
    expect(r.violations).toEqual([]);
    expect(r.bullets[0]?.status).toBe('ok');
    expect(r.stats).toEqual({ total: 1, ok: 1, reverted: 0, dropped: 0 });
  });

  it('reverts a bullet with an invented number to the closest confirmed phrasing', () => {
    const r = factGuard(
      base({ bullets: [bullet('Led automation of reporting, saving 75% of analyst time')] }),
    );
    expect(r.violations).toMatchObject([{ bulletId: 'b1', type: 'number', entity: '75%' }]);
    expect(r.bullets[0]).toMatchObject({
      status: 'reverted',
      text: 'Led automation of reporting, saving 63% of analyst time',
      outputText: 'Led automation of reporting, saving 75% of analyst time',
    });
  });

  it('flags an invented currency amount and a wrong currency', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet('Grew pipeline to ₹8 Cr via partners', ['a2'], 'b1'),
          bullet('Grew pipeline to $5 Cr via partners', ['a2'], 'b2'),
          bullet('Grew pipeline to ₹50 million at an 18% win rate', ['a2'], 'b3'),
        ],
      }),
    );
    expect(r.violations.map((v) => v.bulletId)).toEqual(['b1', 'b2']);
    expect(r.bullets[2]?.status).toBe('ok');
  });

  it('accepts currency metrics and years within the role/project period', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet('Delivered Churn Radar in 2021 on a ₹50 lakh budget', ['p1'], 'b1'),
          bullet('Since 2022, automated reporting in Python', ['a1'], 'b2'),
          bullet('In 2025, automated reporting', ['a1'], 'b3'), // current role: up to now
        ],
      }),
    );
    expect(r.violations).toEqual([]);
  });

  it('flags years outside the role period', () => {
    const r = factGuard(base({ bullets: [bullet('In 2018, grew pipeline to ₹5 Cr', ['a2'])] }));
    expect(r.violations).toMatchObject([{ type: 'number', entity: '2018' }]);
  });

  it('allows numbers that appear in profile text or metric context', () => {
    const r = factGuard(
      base({
        bullets: [bullet('Built dashboards used by 120 managers')],
        profileText: 'Analyst with 7 years',
      }),
    );
    expect(r.violations).toEqual([]);
    const r2 = factGuard(
      base({
        bullets: [bullet('7 years automating reporting')],
        profileText: 'Analyst with 7 years',
      }),
    );
    expect(r2.violations).toEqual([]);
  });

  it('handles sources with no metrics, variants or dates', () => {
    const r = factGuard(base({ bullets: [bullet('Owned onboarding of 12 vendors', ['a3'])] }));
    expect(r.bullets[0]).toMatchObject({ status: 'reverted', text: 'Owned vendor onboarding' });
  });

  it('flags companies, titles, degrees, certifications and institutions not linked to the bullet', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet('Automated reporting for Fabrikam executives', ['a1'], 'b1'),
          bullet('As Business Analyst, automated reporting', ['a1'], 'b2'),
          bullet('Applied MBA training to automate reporting', ['a1'], 'b3'),
          bullet('AWS Certified Solutions Architect who automated reporting', ['a1'], 'b4'),
          bullet('Automated reporting using IIT Bombay methods', ['a1'], 'b5'),
        ],
      }),
    );
    expect(r.violations.map((v) => [v.bulletId, v.type])).toEqual([
      ['b1', 'company'],
      ['b2', 'title'],
      ['b3', 'degree'],
      ['b4', 'certification'],
      ['b5', 'institution'],
    ]);
    expect(r.stats.reverted).toBe(5);
  });

  it('allows the bullet own company and title, and ignores single-word titles', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet(
            'As Senior Data Analyst at Northwind Analytics, an Analyst who automated reporting',
          ),
        ],
      }),
    );
    expect(r.violations).toEqual([]);
  });

  it('flags organisation-like names not present in the vault', () => {
    const r = factGuard(base({ bullets: [bullet('Automated reporting for Globex Technologies')] }));
    expect(r.violations).toMatchObject([{ type: 'company', entity: 'Globex Technologies' }]);
  });

  it('does not double-report an org name already flagged as a known entity', () => {
    const r = factGuard(
      base({
        knownEntities: [{ kind: 'company', name: 'Initech Labs' }],
        bullets: [bullet('Automated reporting for Initech Labs')],
      }),
    );
    expect(r.violations).toHaveLength(1);
  });

  it('accepts org-like names that are in the allowed sources', () => {
    const src: GuardSource = {
      id: 'x',
      text: 'Integrated billing with Zeta Solutions',
      context: { company: 'Acme Labs' },
    };
    const r = factGuard(
      base({
        sources: new Map([['x', src]]),
        knownEntities: [],
        bullets: [bullet('At Acme Labs, integrated billing with Zeta Solutions', ['x'])],
      }),
    );
    expect(r.violations).toEqual([]);
  });

  it('drops bullets with no source mapping or unknown source ids', () => {
    const r = factGuard(
      base({
        bullets: [bullet('Invented achievement', [], 'b1'), bullet('Another', ['zzz'], 'b2')],
      }),
    );
    expect(r.violations).toMatchObject([
      { bulletId: 'b1', type: 'unmapped', entity: '(none)' },
      { bulletId: 'b2', type: 'unmapped', entity: 'zzz' },
    ]);
    expect(r.bullets.every((b) => b.status === 'dropped' && b.text === '')).toBe(true);
    expect(r.stats.dropped).toBe(2);
  });

  it('accepts bullets merged from multiple sources', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet('Automated reporting (63% less effort) and grew pipeline to ₹5 Cr', ['a1', 'a2']),
        ],
      }),
    );
    expect(r.violations).toEqual([]);
  });

  it('preserves ASK placeholders and ignores numbers inside them', () => {
    const r = factGuard(
      base({
        bullets: [
          bullet('Automated reporting, saving [[ASK: How many hours per month, e.g. 30?]] hours'),
        ],
      }),
    );
    expect(r.violations).toEqual([]);
    expect(r.asks).toEqual([{ bulletId: 'b1', question: 'How many hours per month, e.g. 30?' }]);
    expect(r.bullets[0]?.text).toContain('[[ASK:');
  });

  it('does not report ASKs from a reverted bullet', () => {
    const r = factGuard(base({ bullets: [bullet('Saved 99% [[ASK: which team?]]')] }));
    expect(r.asks).toEqual([]);
    expect(r.bullets[0]?.status).toBe('reverted');
  });
});

describe('factGuard — metric units and dates', () => {
  const src = (over: Partial<GuardSource>): GuardSource => ({
    id: 's',
    text: 'Did work',
    context: {},
    ...over,
  });
  const run = (s: GuardSource, text: string) =>
    factGuard(
      base({ sources: new Map([['s', s]]), knownEntities: [], bullets: [bullet(text, ['s'])] }),
    );

  it.each([
    ['USD', '$2M saved', 2_000_000],
    ['$', '$2M saved', 2_000_000],
    ['GBP', '£300K saved', 300_000],
    ['EUR', '€40K saved', 40_000],
    ['percent', 'up 12%', 12],
    ['rupees', '₹9 lakh saved', 900_000],
  ])('maps metric unit %s', (unit, text, value) => {
    expect(run(src({ metrics: [{ value, unit }] }), text).violations).toEqual([]);
  });

  it('treats unknown units as plain numbers', () => {
    expect(run(src({ metrics: [{ value: 14, unit: 'stores' }] }), '14 stores').violations).toEqual(
      [],
    );
    expect(
      run(src({ metrics: [{ value: 14, unit: 'stores' }] }), '14% growth').violations,
    ).toHaveLength(1);
  });

  it('handles open, missing and malformed end dates', () => {
    expect(run(src({ context: { startDate: '2024-01' } }), 'In 2026, did work').violations).toEqual(
      [],
    );
    expect(
      run(src({ context: { startDate: '2024-01', endDate: 'n/a' } }), 'In 2024, did work')
        .violations,
    ).toEqual([]);
    expect(
      run(src({ context: { startDate: '2024-01', endDate: 'n/a' } }), 'In 2025, did work')
        .violations,
    ).toHaveLength(1);
    expect(
      run(src({ context: { startDate: 'bad' } }), 'In 2024, did work').violations,
    ).toHaveLength(1);
  });
});

describe('factGuard — summary', () => {
  it('keeps truthful sentences and removes offending ones', () => {
    const r = factGuard(
      base({
        summary:
          'Data analyst who cut manual reporting effort by 63% using Python. Grew pipeline to ₹9 Cr at Fabrikam. Builds dashboards on Node.js.',
      }),
    );
    expect(r.summary).toBe(
      'Data analyst who cut manual reporting effort by 63% using Python. Builds dashboards on Node.js.',
    );
    expect(
      r.violations
        .filter((v) => v.bulletId === 'summary')
        .map((v) => v.type)
        .sort(),
    ).toEqual(['company', 'number']);
  });

  it('returns null when every sentence is rejected, and reports summary ASKs', () => {
    expect(factGuard(base({ summary: 'Managed 900 people.' })).summary).toBeNull();
    const r = factGuard(base({ summary: 'Analyst. [[ASK: Which industry do you target?]]' }));
    expect(r.asks).toEqual([{ bulletId: 'summary', question: 'Which industry do you target?' }]);
  });

  it('treats a missing summary as null and defaults now/profile', () => {
    const r = factGuard({ bullets: [], sources: new Map(), knownEntities: [] });
    expect(r.summary).toBeNull();
    expect(r.stats.total).toBe(0);
  });
});

describe('helpers', () => {
  it('finds ASK placeholders and detects unresolved ones', () => {
    expect(findAsks('a [[ASK: one?]] b [[ask:two]]')).toEqual(['one?', 'two']);
    expect(hasUnresolvedAsks(['clean', 'also clean'])).toBe(false);
    expect(hasUnresolvedAsks(['clean', 'x [[ASK: y]]'])).toBe(true);
  });

  it('picks the closest confirmed phrasing, falling back to empty for no sources', () => {
    expect(closestSourcePhrasing('saving analyst time', sources.slice(0, 1))).toBe(
      'Led automation of reporting, saving 63% of analyst time',
    );
    expect(closestSourcePhrasing('anything', [])).toBe('');
    expect(closestSourcePhrasing('', [{ id: 'e', text: '', context: {} }])).toBe('');
  });

  it('mentions() matches whole phrases only', () => {
    expect(mentions('Worked at Contoso Retail Group', 'contoso retail')).toBe(true);
    expect(mentions('mentored software engineers', 'Software Engineer')).toBe(false);
    expect(mentions('anything', '  ')).toBe(false);
  });

  it('isCheckable skips single-word titles only', () => {
    expect(isCheckable({ kind: 'title', name: 'Developer' })).toBe(false);
    expect(isCheckable({ kind: 'title', name: 'Staff Engineer' })).toBe(true);
    expect(isCheckable({ kind: 'company', name: 'Acme' })).toBe(true);
  });

  it('extracts org-like names', () => {
    expect(extractOrgLikeNames('Partnered with Zeta Pay Pvt and Acme Labs.')).toEqual([
      'Zeta Pay Pvt',
      'Acme Labs.',
    ]);
  });
});
