import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { latestOtp, uniqueEmail } from './mailpit.js';

test('email OTP login, session restore and sign out', async ({ page }, info) => {
  const email = uniqueEmail(info.project.name);

  // The landing page is public; the app is not.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your real experience');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.getByLabel('Sign-in code').fill(await latestOtp(email));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();

  // New accounts get the short onboarding first; skipping marks it done.
  await expect(page).toHaveURL('/app/welcome');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  // A full reload restores the session from the httpOnly refresh cookie.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login$/);
});

test('wrong code shows an inline error', async ({ page }, info) => {
  const email = uniqueEmail(`wrong-${info.project.name}`);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  const real = await latestOtp(email);
  await page.getByLabel('Sign-in code').fill(real === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('That code is incorrect.');
});

for (const path of ['/', '/login', '/styleguide']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${path} has no WCAG 2.1 AA violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(path);
      // Not 'networkidle': the Turnstile widget on / keeps polling.
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await page.waitForLoadState('load');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe') // third-party Turnstile widget
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
    });
  }
}

test('styleguide renders every section', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/styleguide');
  for (const name of [
    'Colour tokens',
    'Typography',
    'Buttons',
    'Inputs',
    'Data visuals',
    'Cards, toasts, modal',
    'Empty and loading states',
  ]) {
    await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }
  await expect(
    page.getByRole('img', { name: /ATS score 84 out of 100, up 28 from 56/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open modal' }).click();
  await expect(page.getByRole('dialog', { name: 'Save this to your vault?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(errors).toEqual([]);
});

test('landing page: pricing from the API, no horizontal scroll, sign-up path', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Simple pricing in rupees.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', level: 3 })).toBeVisible();
  await page.getByRole('radio', { name: 'Yearly' }).click();
  await expect(page.getByText(/Save ₹/).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('link', { name: 'Start free' }).first().click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
});
