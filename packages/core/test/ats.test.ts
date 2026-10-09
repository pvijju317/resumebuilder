import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATS_WEIGHTS,
  atsScore,
  isQuantified,
  keywordForms,
  lemma,
  parseResumeText,
  phrase,
  type AtsResume,
} from '../src/ats/index.js';

const resume = (over: Partial<AtsResume> = {}): AtsResume => ({
  headline: 'Data Analyst',
  recentTitle: 'Senior Data Analyst, Contoso Retail',
  summary: 'Analyst who automates reporting.',
  bullets: [
    'Automated reporting with Python and SQL, cutting effort by 63%',
    'Built Tableau dashboards for managers',
    'Worked with stakeholders on pricing',
  ],
  skills: ['JS', 'Postgres', 'Excel'],
  fullText: '',
  sections: { summary: true, experience: true, education: true, skills: true },
  format: {
    singleColumn: true,
    standardHeadings: true,
    readableDates: true,
    contactPresent: true,
    noTables: true,
  },
  ...over,
});
const withText = (r: AtsResume) => ({
  ...r,
  fullText: [r.headline, r.recentTitle, r.summary, ...r.bullets].join('\n'),
});

describe('normalization', () => {
  it('lemmatizes and keeps symbol tokens', () => {
    expect(['stakeholders', 'managing', 'dashboards', 'c++', 'node.js', 'aws'].map(lemma)).toEqual([
      'stakeholder',
      'manage',
      'dashboard',
      'c++',
      'node.js',
      'aws',
    ]);
    expect(phrase('Managed (Stakeholder) Relationships, C# & .NET!')).toBe(
      'manage stakeholder relationship c# .net',
    );
  });

  it('expands keyword forms through JD aliases and the alias map', () => {
    expect(keywordForms('JavaScript')).toEqual(
      expect.arrayContaining(['javascript', 'js', 'ecmascript']),
    );
    expect(keywordForms('K8s')).toEqual(expect.arrayContaining(['kubernetes', 'k8s']));
    expect(keywordForms('Experimentation', ['A/B testing'])).toEqual(
      expect.arrayContaining(['experimentation', 'a/b test']),
    );
  });

  it('counts metrics but not bare years as quantified', () => {
    expect(isQuantified('Cut costs by 12%')).toBe(true);
    expect(isQuantified('Led 4 engineers')).toBe(true);
    expect(isQuantified('Joined in 2021 and shipped the app')).toBe(false);
    expect(isQuantified('No numbers here')).toBe(false);
  });
});

describe('atsScore', () => {
  const job = {
    title: 'Data Analyst',
    mustHave: [
      { name: 'SQL' },
      { name: 'Python' },
      { name: 'Tableau' },
      { name: 'Stakeholder management' },
      { name: 'Looker' },
    ],
    niceToHave: [{ name: 'JavaScript' }, { name: 'PostgreSQL' }, { name: 'dbt' }],
  };

  it('classifies keywords as matched, partial or missing, including aliases and lemmas', () => {
    const r = atsScore(withText(resume()), job);
    const state = Object.fromEntries(r.keywords.map((k) => [k.name, k.state]));
    expect(state).toEqual({
      SQL: 'matched',
      Python: 'matched',
      Tableau: 'matched',
      'Stakeholder management': 'partial', // "stakeholders" only
      Looker: 'missing',
      JavaScript: 'matched', // "JS" in skills via alias map
      PostgreSQL: 'matched', // "Postgres"
      dbt: 'missing',
    });
    expect(r.parts.mustHave).toBeCloseTo(((1 + 1 + 1 + 0.5 + 0) / 5) * ATS_WEIGHTS.mustHave);
    expect(r.parts.niceToHave).toBeCloseTo((2 / 3) * ATS_WEIGHTS.niceToHave);
    expect(r.notes[0]).toBe('Missing required keywords: Looker.');
  });

  it('rewards must-haves that appear in experience bullets, not only in skills', () => {
    const inSkillsOnly = withText(
      resume({ bullets: ['Did analysis work for the team'], skills: ['SQL', 'Python', 'Tableau'] }),
    );
    const r = atsScore(inSkillsOnly, {
      title: 'Data Analyst',
      mustHave: [{ name: 'SQL' }, { name: 'Python' }],
      niceToHave: [],
    });
    expect(r.parts.placement).toBe(0);
    expect(r.notes).toContain('Show these in your experience, not only in skills: SQL, Python.');
    expect(r.parts.niceToHave).toBe(ATS_WEIGHTS.niceToHave); // no nice-to-haves: nothing missing
  });

  it('scores title alignment and quantified bullets', () => {
    const off = withText(
      resume({
        headline: 'Teacher',
        recentTitle: 'Science Teacher',
        summary: null,
        bullets: ['Taught 30 students', 'Planned lessons', 'Graded work', 'Ran clubs'],
      }),
    );
    const r = atsScore(off, job);
    expect(r.parts.title).toBe(0);
    expect(r.parts.quantified).toBeCloseTo((0.25 / 0.5) * ATS_WEIGHTS.quantified);
    expect(r.notes).toContain('Your recent title or headline does not reflect "Data Analyst".');
    expect(r.notes).toContain('1 of 4 bullets include a number. Aim for at least half.');
  });

  it('applies format and section checks with notes', () => {
    const r = atsScore(
      withText(
        resume({
          bullets: [],
          sections: { summary: false, experience: true, education: false, skills: true },
          format: {
            singleColumn: false,
            standardHeadings: true,
            readableDates: false,
            contactPresent: false,
            noTables: true,
          },
        }),
      ),
      { title: 'Analyst', mustHave: [], niceToHave: [] },
    );
    expect(r.parts.format).toBeCloseTo((2 / 5) * ATS_WEIGHTS.format);
    expect(r.parts.sections).toBeCloseTo((2 / 4) * ATS_WEIGHTS.sections);
    expect(r.parts.quantified).toBe(0);
    expect(r.parts.mustHave).toBe(ATS_WEIGHTS.mustHave);
    expect(r.parts.placement).toBe(0);
    expect(r.notes).toEqual(
      expect.arrayContaining([
        'Two-column layouts can be read out of order by some ATS. A single column is safer.',
        'Add an email or phone number.',
        'Use clear dates such as "Mar 2021" for each role.',
        'Add a Summary section.',
        'Add a Education section.',
      ]),
    );
  });

  it('keeps scores within 0–100 and improves when the resume mirrors the job', () => {
    const before = atsScore(withText(resume()), job).score;
    const tailored = withText(
      resume({
        bullets: [
          ...resume().bullets,
          'Led stakeholder management for Looker rollout',
          'Modelled data with dbt',
        ],
      }),
    );
    const after = atsScore(tailored, job).score;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(100);
  });
});

describe('parseResumeText on a fixture', () => {
  const text = readFileSync(
    resolve(import.meta.dirname, '../../../evals/resumes/files/r08-finance-txt.txt'),
    'utf8',
  );

  it('finds sections, bullets, skills, title and contacts', () => {
    const r = parseResumeText(text);
    expect(r.sections).toEqual({ summary: true, experience: true, education: true, skills: true });
    expect(r.bullets).toEqual([
      'Owned monthly variance analysis for a ₹900 Cr cost base',
      'Built a rolling forecast model in Excel used by 6 business units',
      'Prepared quarterly board packs',
    ]);
    expect(r.skills).toEqual(['Financial modelling', 'Excel', 'FP&A', 'Power BI']);
    expect(r.recentTitle).toBe('Woodgrove Bank -- Financial Analyst (2022-07 - Present)');
    expect(r.headline).toBe('Financial Analyst');
    expect(r.format).toMatchObject({
      contactPresent: true,
      readableDates: true,
      standardHeadings: true,
      singleColumn: true,
    });
    expect(parseResumeText(text, { twoColumn: true }).format.singleColumn).toBe(false);
  });

  it('scores the fixture against a realistic finance JD', () => {
    const r = atsScore(parseResumeText(text), {
      title: 'Financial Analyst',
      mustHave: [
        { name: 'Financial modeling', aliases: ['financial modelling'] },
        { name: 'Excel' },
        { name: 'Variance analysis' },
        { name: 'SQL' },
      ],
      niceToHave: [{ name: 'Power BI' }, { name: 'SAP' }],
    });
    expect(r.keywords.filter((k) => k.state === 'missing').map((k) => k.name)).toEqual([
      'SQL',
      'SAP',
    ]);
    expect(r.parts.title).toBe(ATS_WEIGHTS.title);
    expect(r.score).toBeGreaterThan(60);
    expect(r.score).toBeLessThan(95);
  });

  it('handles text with no recognisable headings', () => {
    const r = parseResumeText('Jane\nSome text without structure\n- a bullet line here');
    expect(r.sections).toEqual({
      summary: false,
      experience: false,
      education: false,
      skills: false,
    });
    expect(r.bullets).toEqual([]);
    expect(r.format.standardHeadings).toBe(false);
  });
});
