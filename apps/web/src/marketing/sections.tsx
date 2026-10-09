import { formatVaultDate, REGION_RULES, type RegionRules } from '@tailor/core';
import type { Region } from '@tailor/shared';
import { Button, Chip, cn, Input, ProgressSteps, StrengthMeter, OPTIMIZE_STEPS } from '@tailor/ui';
import {
  ArrowRight,
  Check,
  CircleHelp,
  Lock,
  MousePointerClick,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Reveal } from './reveal.js';

export const SIGNUP_LABEL = 'Start free';

function SectionHeading({ id, title, body }: { id?: string; title: string; body?: string }) {
  return (
    <div className="flex max-w-[60ch] flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold tracking-tight text-text md:text-2xl">
        {title}
      </h2>
      {body ? <p className="text-base text-muted">{body}</p> : null}
    </div>
  );
}

/** Bento: three steps with different weights and surfaces, each shown with a real component. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-24 py-20 md:py-28">
      <Reveal>
        <SectionHeading
          id="how-title"
          title="Build your record once. Tailor it in seconds."
          body="Your Career Vault holds every role, result and metric you have confirmed. Each job gets a resume built from it."
        />
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3 md:grid-rows-[auto_auto]">
        <Reveal className="md:col-span-2">
          <article className="flex h-full flex-col gap-6 rounded-[var(--radius-card)] border border-border bg-surface p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Upload your resume. Answer a few questions.
              </h3>
              <p className="max-w-[52ch] text-sm text-muted">
                We turn it into a structured vault you review and confirm. Short questions pull out
                the numbers you never wrote down.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-[var(--radius-control)] bg-surface-muted p-4">
                <StrengthMeter value={38} label="Before questions" />
                <StrengthMeter value={81} label="After 4 answers" />
              </div>
              <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-4">
                <p className="text-sm font-medium text-text">
                  How many people used these dashboards each week?
                </p>
                <Input
                  readOnly
                  value="About 120 store and category managers"
                  aria-label="Example answer"
                  className="bg-bg"
                />
                <p className="text-xs text-subtle">Saved to your vault as a metric.</p>
              </div>
            </div>
          </article>
        </Reveal>

        <Reveal className="md:row-span-2" delay={80}>
          <article className="flex h-full flex-col gap-6 rounded-[var(--radius-card)] bg-accent-soft p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Paste a job. Get a tailored resume.
              </h3>
              <p className="text-sm text-muted">
                We pick your most relevant achievements, rewrite them in the job&rsquo;s language
                and check every fact.
              </p>
            </div>
            <div className="mt-auto rounded-[var(--radius-control)] border border-border bg-surface p-4">
              <ProgressSteps steps={OPTIMIZE_STEPS} current="checking" orientation="vertical" />
            </div>
          </article>
        </Reveal>

        <Reveal className="md:col-span-2" delay={120}>
          <article className="flex h-full flex-col gap-6 rounded-[var(--radius-card)] border border-border bg-surface-muted p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="flex max-w-[44ch] flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Apply, then see what gets callbacks.
              </h3>
              <p className="text-sm text-muted">
                Every application keeps the exact resume version you sent, so you can compare which
                versions lead to interviews.
              </p>
            </div>
            <ol
              className="flex flex-wrap items-center gap-1.5 text-xs font-medium"
              aria-label="Application statuses"
            >
              {['Applied', 'Screening', 'Interview', 'Offer'].map((s, i, all) => (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-1',
                      i === 2
                        ? 'border-transparent bg-accent text-accent-fg'
                        : 'border-border bg-surface text-muted',
                    )}
                  >
                    {s}
                  </span>
                  {i < all.length - 1 ? (
                    <ArrowRight aria-hidden className="size-3.5 text-subtle" />
                  ) : null}
                </li>
              ))}
            </ol>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

/** Split: the differentiator, shown as the actual Fact Guard review UI. */
export function FactGuardSection() {
  return (
    <section
      id="fact-guard"
      aria-labelledby="fg-title"
      className="grid scroll-mt-24 items-center gap-12 py-20 md:grid-cols-[1fr_1.1fr] md:py-28"
    >
      <Reveal className="flex flex-col gap-6">
        <SectionHeading
          id="fg-title"
          title="It never invents your experience."
          body="Every number, employer, title and date in a tailored resume must exist in your vault. Anything else is reverted before you see it."
        />
        <ul className="flex flex-col gap-3 text-sm text-text">
          {[
            [ShieldCheck, 'Checked by code, not by another AI prompt'],
            [CircleHelp, 'Missing details become questions, never guesses'],
            [Lock, 'Download stays locked until every question is answered'],
          ].map(([Icon, text]) => {
            const I = Icon as typeof ShieldCheck;
            return (
              <li key={text as string} className="flex items-center gap-3">
                <I aria-hidden className="size-5 shrink-0 text-accent-text" strokeWidth={1.5} />
                {text as string}
              </li>
            );
          })}
        </ul>
      </Reveal>

      <Reveal delay={80}>
        <div className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface shadow-raised">
          <div className="flex flex-col gap-2 border-b border-border p-5">
            <p className="text-xs font-medium text-danger">Reverted: 75% is not in your vault</p>
            <p className="text-sm text-muted line-through decoration-danger/60">
              Cut manual reporting effort by 75% with Python automation.
            </p>
            <p className="flex items-start gap-2 text-sm text-text">
              <Undo2
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-success"
                strokeWidth={1.5}
              />
              Automated monthly sales reporting in Python, cutting manual effort by 63%.
            </p>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <p className="text-xs font-medium text-warning">Question before download</p>
            <p className="text-sm text-text">
              Built Tableau dashboards used by{' '}
              <mark className="rounded-[4px] bg-warning-soft px-1 text-warning">
                how many people?
              </mark>
            </p>
            <div className="flex gap-2">
              <Input readOnly value="120 managers" aria-label="Example answer" />
              <Button type="button" variant="secondary" tabIndex={-1} aria-hidden>
                <Check /> Save
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const PHOTO: Record<RegionRules['photo'], string> = {
  never: 'Never',
  'optional-off': 'Optional, off by default',
  optional: 'Optional',
};
const PERSONAL: Record<RegionRules['personalFields'], string> = {
  never: 'Never included',
  'optional-off': 'Optional, off by default',
  'europass-optional': 'Optional Europass fields',
};
const SPELLING: Record<RegionRules['spelling'], string> = {
  'en-IN': 'Indian English',
  'en-US': 'American English',
  'en-GB': 'British English',
};
const EXTRAS: Record<RegionRules['extras'][number], string> = {
  noticePeriod: 'Notice period',
  workAuthorization: 'Work authorization',
  rightToWork: 'Right to work',
  languagesCefr: 'Languages with CEFR levels',
};
const REGION_NAMES: Record<Region, string> = {
  IN: 'India',
  US: 'United States',
  UK: 'United Kingdom',
  EU: 'Europe',
};

function pages(r: RegionRules) {
  const base = `${r.defaultPages.base} page${r.defaultPages.base > 1 ? 's' : ''}`;
  return r.defaultPages.twoPagesAtYears
    ? `${base}, 2 from ${r.defaultPages.twoPagesAtYears} years`
    : base;
}

/** Tabs: region rules, rendered from the same config the renderer and prompts use. */
export function Regions() {
  const [region, setRegion] = useState<Region>('IN');
  const r = REGION_RULES[region];
  const rows: [string, string][] = [
    ['Document', r.documentLabel],
    ['Length', pages(r)],
    ['Photo', PHOTO[r.photo]],
    ['Date of birth, marital status', PERSONAL[r.personalFields]],
    ['Spelling', SPELLING[r.spelling]],
    ['Dates', formatVaultDate('2023-04', region)],
    ['Opening section', r.statementLabel],
    ['Extra line', r.extras.map((e) => EXTRAS[e]).join(', ')],
  ];
  return (
    <section aria-labelledby="regions-title" className="py-20 md:py-28">
      <Reveal>
        <SectionHeading
          id="regions-title"
          title="The right format for where you apply."
          body="A resume that works in Bengaluru can get filtered in London. Pick a country and the format follows."
        />
      </Reveal>
      <Reveal delay={80} className="mt-10">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <div
            role="tablist"
            aria-label="Country"
            className="flex overflow-x-auto border-b border-border"
          >
            {(Object.keys(REGION_RULES) as Region[]).map((k) => (
              <button
                key={k}
                role="tab"
                type="button"
                aria-selected={region === k}
                aria-controls="region-panel"
                onClick={() => setRegion(k)}
                className={cn(
                  'relative h-12 shrink-0 px-5 text-sm font-medium transition-colors duration-150',
                  region === k
                    ? 'text-text after:absolute after:inset-x-5 after:bottom-0 after:h-0.5 after:bg-accent'
                    : 'text-muted hover:text-text',
                )}
              >
                {REGION_NAMES[k]}
              </button>
            ))}
          </div>
          <div id="region-panel" role="tabpanel" aria-label={REGION_NAMES[region]}>
            <dl className="grid sm:grid-cols-2">
              {rows.map(([k, v], i) => (
                <div
                  key={k}
                  className={cn(
                    'flex flex-col gap-1 px-5 py-4 md:px-6',
                    i < rows.length - 2 && 'border-b border-border',
                    i % 2 === 0 && 'sm:border-r sm:border-border',
                    i === rows.length - 2 && 'max-sm:border-b max-sm:border-border',
                  )}
                >
                  <dt className="text-xs text-subtle">{k}</dt>
                  <dd className="tabular text-sm font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** Two panels: extension + tracker. */
export function WhereYouApply() {
  const boards = ['LinkedIn', 'Naukri', 'Indeed'];
  const forms = ['Greenhouse', 'Lever', 'Workday'];
  return (
    <section aria-labelledby="apply-title" className="py-20 md:py-28">
      <Reveal>
        <SectionHeading id="apply-title" title="Works on the job boards you already use." />
      </Reveal>
      <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <article className="flex h-full flex-col gap-6 rounded-[var(--radius-card)] border border-border bg-surface p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-text">Chrome extension</h3>
              <p className="max-w-[48ch] text-sm text-muted">
                Open a job and see your match score. Tailor without leaving the page, then autofill
                the application form.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs text-subtle">Reads jobs on</p>
                <div className="flex flex-wrap gap-1.5">
                  {boards.map((b) => (
                    <Chip key={b}>{b}</Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-subtle">Fills forms on</p>
                <div className="flex flex-wrap gap-1.5">
                  {forms.map((b) => (
                    <Chip key={b}>{b}</Chip>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-auto flex items-center gap-2 border-t border-border pt-4 text-sm text-text">
              <MousePointerClick
                aria-hidden
                className="size-4 text-accent-text"
                strokeWidth={1.5}
              />
              It never submits. You review and press submit yourself.
            </p>
          </article>
        </Reveal>
        <Reveal delay={80}>
          <article className="flex h-full flex-col justify-between gap-6 rounded-[var(--radius-card)] bg-surface-muted p-6 md:p-8">
            <div className="flex flex-col gap-2">
              <h3 className="text-lg font-semibold tracking-tight text-text">
                Your data stays yours
              </h3>
              <p className="text-sm text-muted">
                Email, phone and address are removed before any AI step. Your data is never used to
                train models unless you opt in. Export or delete it at any time.
              </p>
            </div>
            <Link
              to="#faq"
              className="text-sm font-medium text-accent-text underline-offset-4 hover:underline"
            >
              Read the privacy questions
            </Link>
          </article>
        </Reveal>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="py-20 md:py-28">
      <Reveal>
        <div className="flex flex-col items-start gap-6 rounded-[var(--radius-card)] bg-accent-soft p-8 md:flex-row md:items-center md:justify-between md:p-12">
          <div className="flex max-w-[44ch] flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-text">
              Start with the resume you already have.
            </h2>
            <p className="text-base text-muted">Free to start. No card needed.</p>
          </div>
          <Button asChild size="lg">
            <Link to="/login?mode=signup">
              {SIGNUP_LABEL} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
