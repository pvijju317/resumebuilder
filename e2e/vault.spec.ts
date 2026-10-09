import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestOtp, uniqueEmail } from './mailpit.js';

/**
 * Phase 1 acceptance: vault build → review → confirm → editor CRUD → gap answer.
 * The parse worker's AI call is replaced by writing a draft with psql, so this runs without an
 * AI key; `pnpm eval:parse` covers live parsing.
 */
const DB =
  process.env['E2E_DATABASE_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://tailor:tailor@localhost:5432/tailor';
const psql = (sql: string) =>
  execFileSync(process.env['PSQL'] ?? 'psql', [DB, '-tAc', sql], { encoding: 'utf8' }).trim();
const RESUME = readFileSync(
  resolve(import.meta.dirname, '../evals/resumes/files/r08-finance-txt.txt'),
  'utf8',
);

const DRAFT = {
  profile: {
    name: 'Neha Kulkarni',
    email: 'neha@example.com',
    phone: '+91 98220 66778',
    location: 'Mumbai',
    headline: 'Financial Analyst',
    links: [],
  },
  roles: [
    {
      company: 'Woodgrove Bank',
      title: 'Financial Analyst',
      location: 'Mumbai',
      startDate: '2022-07',
      endDate: null,
      confidence: 1,
      achievements: [
        {
          text: 'Owned monthly variance analysis for a large cost base',
          metrics: [],
          skills: ['FP&A'],
          impactType: [],
          confidence: 1,
        },
        {
          text: 'Built a rolling forecast model in Excel',
          metrics: [],
          skills: ['Excel'],
          impactType: [],
          confidence: 0.6,
        },
      ],
    },
    {
      company: 'Northwind Capital',
      title: 'Finance Associate',
      startDate: '2020-08',
      endDate: '2022-06',
      confidence: 1,
      achievements: [
        {
          text: 'Prepared quarterly board packs',
          metrics: [],
          skills: [],
          impactType: [],
          confidence: 1,
        },
      ],
    },
  ],
  projects: [],
  education: [{ institution: 'Contoso College of Commerce', degree: 'B.Com', confidence: 1 }],
  certifications: [],
  skills: [{ name: 'Excel' }, { name: 'Power BI' }],
  extras: { languages: [], awards: [], publications: [], volunteering: [] },
};

async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

async function signUp(page: Page, email: string) {
  await page.goto('/login?mode=signup');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByLabel('Sign-in code').fill(await latestOtp(email));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
}

test('career vault: onboarding, consent, build, review, confirm, edit, strengthen', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const email = uniqueEmail(`vault-${info.project.name}`);
  // Instant animations so contrast scans never sample a half-faded element.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signUp(page, email);

  await expect(page).toHaveURL(/\/app\/welcome$/);
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/app\/vault$/);

  // Consent gate before any AI processing.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel(/I agree to AI processing/).check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('tab', { name: 'Paste text' }).click();
  await page.getByLabel('Resume text').fill(RESUME);
  await page.getByRole('button', { name: 'Build my vault' }).click();
  await expect(page.getByRole('heading', { name: 'Building your vault' })).toBeVisible();

  // Worker stand-in.
  const userId = psql(`select id from "User" where email = '${email}'`);
  psql(
    `update "VaultImport" set status = 'ready', draft = '${JSON.stringify(DRAFT).replace(/'/g, "''")}' where "userId" = '${userId}'`,
  );

  await expect(page.getByRole('heading', { name: 'Review your vault' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Please check')).toHaveCount(0); // role confidence is high
  await expectAccessible(page);
  await page.getByLabel('Job title').first().fill('Senior Financial Analyst');
  await page.getByRole('button', { name: 'Confirm and save' }).click();

  // Editor.
  await expect(page.getByRole('heading', { name: 'Neha Kulkarni' })).toBeVisible();
  await expect(page.getByText('Senior Financial Analyst')).toBeVisible();
  await expect(page.getByText('Jul 2022 to Present')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Add certification' }).click();
  await page.getByLabel('Certification', { exact: true }).fill('CFA Level 1');
  await page.getByLabel('Issuer', { exact: true }).fill('CFA Institute');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('CFA Level 1')).toBeVisible();

  await page.getByRole('button', { name: 'Edit certification' }).click();
  await page.getByLabel('Certification', { exact: true }).fill('CFA Level 2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('CFA Level 2')).toBeVisible();

  await page.getByRole('button', { name: 'Hide certification' }).click();
  await expect(page.getByRole('button', { name: 'Show certification' })).toBeVisible();

  const experience = page.getByRole('region', { name: 'Experience' });
  await experience.getByRole('button', { name: 'Move role down' }).first().click();
  await expect(
    experience
      .getByRole('paragraph')
      .filter({ hasText: /Analyst|Associate/ })
      .first(),
  ).toHaveText('Finance Associate');

  await page.getByRole('button', { name: 'Add achievement' }).first().click();
  await page
    .getByLabel('Achievement', { exact: true })
    .fill('Prepared 12 quarterly board packs for the CFO');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Prepared 12 quarterly board packs for the CFO')).toBeVisible();

  await page.getByRole('button', { name: 'Delete certification' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('CFA Level 2')).toHaveCount(0);

  // Gap question → metric.
  const vaultId = psql(`select id from "Vault" where "userId" = '${userId}'`);
  const achId = psql(
    `select a.id from "VaultAchievement" a join "VaultRole" r on r.id = a."roleId" where r."vaultId" = '${vaultId}' and a.text like 'Built a rolling%'`,
  );
  psql(
    `insert into "VaultGapQuestion"(id, "vaultId", "achievementId", question, "expectedUnit", "updatedAt") values ('gq-${Date.now()}', '${vaultId}', '${achId}', 'How many business units used the model?', 'units', now())`,
  );
  await page.reload();
  await page.getByRole('link', { name: /Strengthen your vault \(1\)/ }).click();
  await page.getByLabel('How many business units used the model?').fill('6 business units');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await expect(page.getByRole('heading', { name: 'All done for now' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to vault' }).click();
  await expect(page.getByText('6 business units')).toBeVisible();
});
