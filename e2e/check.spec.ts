import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { latestOtp, uniqueEmail } from './mailpit.js';

/** Phase 2a: anonymous ATS check from the landing page, and job intake in the app. */
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
const JD = `Financial Analyst at Fabrikam Bank, Mumbai.
We are hiring a Financial Analyst to own monthly variance analysis and forecasting for the retail business.
Requirements: financial modelling in Excel, variance analysis, SQL, and clear board reporting. Nice to have: Power BI and SAP.
You will partner with business unit heads and present recommendations to the CFO every quarter.`;
const EXTRACTION = {
  title: 'Financial Analyst',
  company: 'Fabrikam Bank',
  location: 'Mumbai',
  seniority: 'mid',
  mustHave: [
    { name: 'Financial modelling', aliases: [] },
    { name: 'Excel', aliases: [] },
    { name: 'Variance analysis', aliases: [] },
    { name: 'SQL', aliases: [] },
  ],
  niceToHave: [
    { name: 'Power BI', aliases: [] },
    { name: 'SAP', aliases: [] },
  ],
  responsibilities: [],
  keywords: [],
  education: [],
};

/** Worker stand-in for jd.extract. */
function extract(jobId: string) {
  const json = JSON.stringify(EXTRACTION).replace(/'/g, "''");
  psql(`with c as (insert into "JdCache"(id, hash, raw, extracted, model) values ('jd-${jobId}', md5(random()::text), 'x', '${json}', 'test') returning id)
        update "Job" set status = 'ready', "jdCacheId" = (select id from c), "rawText" = null where id = '${jobId}'`);
}

async function expectAccessible(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('iframe')
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test('anonymous ATS check from the landing page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('link', { name: 'Check my ATS score' }).click();
  await expect(page).toHaveURL(/#check$/);
  const form = page.locator('#check');
  await form.getByRole('tab', { name: 'Paste' }).first().click();
  await form.getByLabel('Resume text').fill(RESUME);
  await form.getByLabel('Job description').fill(JD);
  // Turnstile (Cloudflare test key) issues a token, then the button enables.
  await expect(form.getByRole('button', { name: 'Check my ATS score' })).toBeEnabled({
    timeout: 20_000,
  });
  await form.getByRole('button', { name: 'Check my ATS score' }).click();

  await expect(page).toHaveURL(/\/check\/[a-z0-9]+$/);
  await expect(page.getByRole('heading', { name: 'Checking your resume' })).toBeVisible();
  const sessionId = page.url().split('/').pop()!;
  extract(psql(`select "jobId" from "AnonSession" where id = '${sessionId}'`));

  await expect(
    page.getByRole('heading', { name: /Financial Analyst at Fabrikam Bank/ }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('img', { name: /ATS score \d+ out of 100/ })).toBeVisible();
  await expect(page.getByText('SQL(missing)')).toBeVisible();
  await expect(page.getByText('Real ATS systems vary.', { exact: false })).toBeVisible();
  await expectAccessible(page);

  // The result belongs to this browser only.
  const other = await page.context().browser()!.newPage();
  await other.goto(page.url());
  await expect(
    other.getByRole('heading', { name: 'This check is no longer available' }),
  ).toBeVisible();
  await other.close();
});

test('job intake: add, edit requirements, see match prompt', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const email = uniqueEmail(`jobs-${info.project.name}`);
  await page.goto('/login?mode=signup');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.getByLabel('Sign-in code').fill(await latestOtp(email));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  await page.goto('/app/jobs');
  await page.getByRole('button', { name: 'Add job' }).first().click();
  await page.getByLabel('Job description').fill(JD);
  await page.getByRole('button', { name: 'Add job' }).last().click();
  await expect(page.getByRole('heading', { name: 'Reading the job' })).toBeVisible();
  extract(page.url().split('/').pop()!);

  await expect(page.getByRole('heading', { name: 'Financial Analyst' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Remove SAP' }).click();
  await expect(page.getByRole('button', { name: 'Remove SAP' })).toHaveCount(0);
  await page.getByLabel('Add to required').fill('Forecasting');
  await page.getByLabel('Add to required').press('Enter');
  await expect(page.getByText('Forecasting', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset to original' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Build your vault to see your match' }),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto('/app/jobs');
  await expect(page.getByRole('link', { name: /Financial Analyst/ })).toBeVisible();
});
