import { describe, expect, it } from 'vitest';
import {
  answerToMetrics,
  educationTitle,
  repeatsAchievement,
  selectGapCandidates,
  strengthTip,
  vaultStrength,
  type StrengthInput,
} from '../src/vault.js';

const ach = (
  id: string,
  metrics = 0,
  extra: Partial<{ skills: string[]; hidden: boolean; order: number }> = {},
) => ({
  id,
  text: `did ${id}`,
  metrics: Array.from({ length: metrics }, () => ({ value: 1, unit: 'x', context: 'c' })),
  skills: extra.skills ?? ['sql'],
  hidden: extra.hidden ?? false,
  order: extra.order ?? 0,
});

const base = (): StrengthInput => ({
  profile: {
    name: 'A',
    email: 'a@b.co',
    phone: '+91 98450 12345',
    location: 'Pune',
    headline: 'Analyst',
    links: [{}],
  },
  roles: [
    {
      id: 'r1',
      startDate: '2022-01',
      endDate: null,
      order: 0,
      achievements: [ach('a1', 1), ach('a2'), ach('a3')],
    },
    {
      id: 'r2',
      startDate: '2019-01',
      endDate: '2021-12',
      order: 1,
      achievements: [ach('a4'), ach('a5', 1), ach('a6')],
    },
  ],
  projects: [],
  educationCount: 1,
  skillsCount: 10,
});

describe('vaultStrength', () => {
  it('scores an empty vault at 0', () => {
    expect(
      vaultStrength({ profile: {}, roles: [], projects: [], educationCount: 0, skillsCount: 0 })
        .score,
    ).toBe(0);
  });

  it('increases as metrics are added (PRD F3)', () => {
    const v = base();
    const before = vaultStrength(v).score;
    v.roles[0]!.achievements[1]!.metrics.push({ value: 40, unit: 'dashboards', context: 'built' });
    v.roles[1]!.achievements[0]!.metrics.push({ value: 3, unit: 'x', context: 'faster' });
    const after = vaultStrength(v).score;
    expect(after).toBeGreaterThan(before);
    expect(before).toBe(Math.round(15 + 15 + (2 / 6 / 0.6) * 40 + 15 + 10 + 5));
  });

  it('caps at 100 for a complete, well-quantified vault', () => {
    const v = base();
    v.roles.forEach((r) =>
      r.achievements.forEach((a) => a.metrics.push({ value: 1, unit: 'x', context: '' })),
    );
    expect(vaultStrength(v).score).toBe(100);
  });

  it('ignores hidden items and credits project-only freshers', () => {
    const fresher: StrengthInput = {
      profile: { name: 'F' },
      roles: [],
      projects: [{ achievements: [ach('p1', 1), ach('p2', 0, { skills: [] })] }],
      educationCount: 1,
      skillsCount: 4,
    };
    const s = vaultStrength(fresher);
    expect(s.parts.experience).toBeCloseTo(15);
    expect(s.parts.skillTagged).toBeCloseTo(2.5);
    const v = base();
    v.roles[1]!.hidden = true;
    v.roles[0]!.achievements[0]!.hidden = true;
    expect(vaultStrength(v).parts.quantified).toBe(0);
  });

  it('penalises undated roles and thin roles', () => {
    const v = base();
    v.roles[1]!.startDate = null;
    v.roles[1]!.achievements = [];
    expect(vaultStrength(v).parts.experience).toBeLessThan(15);
  });
});

describe('selectGapCandidates', () => {
  it('picks unquantified, visible achievements, most recent role first, capped', () => {
    const v = base();
    v.roles[0]!.achievements[2]!.hidden = true;
    v.roles[1]!.achievements[2]!.order = -1;
    expect(selectGapCandidates(v).map((a) => a.id)).toEqual(['a2', 'a6', 'a4']);
    expect(selectGapCandidates(v, 1).map((a) => a.id)).toEqual(['a2']);
  });

  it('orders by end date then start date and includes projects last', () => {
    const v = {
      roles: [
        { id: 'old', startDate: '2015-01', endDate: '2018-01', order: 0, achievements: [ach('o')] },
        { id: 'cur2', startDate: '2020-01', endDate: null, order: 1, achievements: [ach('c2')] },
        { id: 'cur1', startDate: '2023-01', endDate: null, order: 2, achievements: [ach('c1')] },
        {
          id: 'hid',
          startDate: '2024-01',
          endDate: null,
          order: 3,
          hidden: true,
          achievements: [ach('h')],
        },
      ],
      projects: [{ achievements: [ach('p')] }, { hidden: true, achievements: [ach('hp')] }],
    };
    expect(selectGapCandidates(v).map((a) => a.id)).toEqual(['c1', 'c2', 'o', 'p']);
  });
});

describe('answerToMetrics', () => {
  const ctx = { context: 'How many people used the dashboards?' };
  it.each([
    ['About 120 store managers', 120, 'store managers'],
    ['About 120 store and category managers, roughly', 120, 'store and category managers'],
    ['roughly 35% less time', 35, '%'],
    ['₹5 Cr in the first year', 50_000_000, 'INR'],
    ['40 of them', 40, 'them'],
    ['12', 12, ''],
  ])('%s', (answer, value, unit) => {
    expect(answerToMetrics(answer, ctx)[0]).toEqual({ value, unit, context: ctx.context });
  });

  it('falls back to the expected unit and returns nothing without numbers', () => {
    expect(answerToMetrics('7 per week', { ...ctx, expectedUnit: 'reports' })[0]?.unit).toBe(
      'week',
    );
    expect(answerToMetrics('7', { ...ctx, expectedUnit: 'reports' })[0]?.unit).toBe('reports');
    expect(answerToMetrics('a lot, honestly', ctx)).toEqual([]);
  });
});

describe('strengthTip', () => {
  it('asks for numbers while that is the biggest gap', () => {
    expect(strengthTip(base())).toBe('Add numbers to achievements to raise your strength.');
  });

  it('never asks for numbers once they no longer raise the score', () => {
    const v = base();
    v.roles.forEach((r) =>
      r.achievements.forEach((a) => a.metrics.push({ value: 1, unit: 'x', context: '' })),
    );
    v.profile.links = [];
    expect(vaultStrength(v).parts.quantified).toBe(40);
    expect(strengthTip(v)).toBe('Add a LinkedIn or portfolio link to your profile.');
    v.profile.links = [{}];
    expect(strengthTip(v)).toBeNull();
  });

  it('names the missing profile field or section', () => {
    const v = base();
    v.roles.forEach((r) =>
      r.achievements.forEach((a) => a.metrics.push({ value: 1, unit: 'x', context: '' })),
    );
    v.skillsCount = 2;
    expect(strengthTip(v)).toBe('Add more of your skills (aim for 10).');
    v.skillsCount = 10;
    v.educationCount = 0;
    expect(strengthTip(v)).toBe('Add your education.');
    v.educationCount = 1;
    v.profile.phone = null;
    expect(strengthTip(v)).toBe('Add your phone to your profile.');
  });
});

describe('educationTitle', () => {
  it('does not repeat a field the degree already names', () => {
    expect(educationTitle('B.Tech Computer Science', 'Computer Science')).toBe(
      'B.Tech Computer Science',
    );
    expect(educationTitle('B.Tech', 'Computer Science')).toBe('B.Tech, Computer Science');
    expect(educationTitle(null, 'Statistics')).toBe('Statistics');
    expect(educationTitle('MBA', null)).toBe('MBA');
  });
});

describe('repeatsAchievement', () => {
  it('spots a summary copied from a bullet, ignoring case and punctuation', () => {
    const a = [{ text: 'Built a prototype; 300 beta users.' }];
    expect(repeatsAchievement('built a prototype 300 beta users', a)).toBe(true);
    // Lightly reworded by the parser (seen live with the real model).
    expect(
      repeatsAchievement(
        'Side project: Built a no-code prototype that explained credit scores to first-time borrowers.',
        [
          {
            text: 'Built a no-code prototype that explained credit scores to first-time borrowers; 300 beta users.',
          },
        ],
      ),
    ).toBe(true);
    expect(repeatsAchievement('A credit score explainer for first-time borrowers', a)).toBe(false);
  });
});
