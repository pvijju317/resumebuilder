import type { PublicPlan } from '@tailor/shared';
import { Button, cn, Skeleton } from '@tailor/ui';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Reveal } from './reveal.js';
import { SIGNUP_LABEL } from './sections.js';

const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(paise / 100);

function features(p: PublicPlan): string[] {
  const f = p.features;
  const out: string[] = [];
  if (p.interval === 'one_time')
    out.push(`${p.credits} tailored resumes, valid ${f.validityDays ?? 30} days`);
  else out.push(`${p.credits} tailored resumes a month`);
  if (p.premiumCredits > 0) out.push(`${p.premiumCredits} premium rewrites a month`);
  out.push('Unlimited ATS checks');
  out.push(
    p.downloadsPerMonth === null
      ? 'Unlimited PDF and DOCX downloads'
      : `${p.downloadsPerMonth} download a month`,
  );
  if (f.editor) out.push('Full resume editor');
  if (f.coverLetters) out.push('Cover letters');
  if (f.autofill) out.push('Extension autofill');
  if (f.tracker) out.push('Application tracker');
  if (f.priorityQueue) out.push('Priority queue');
  return out;
}

/** free | starter | pro | power, from ids like `pro_monthly`. */
const family = (id: string) => id.split('_')[0]!;

export function Pricing() {
  const [yearly, setYearly] = useState(false);
  const q = useQuery({
    queryKey: ['plans'],
    queryFn: () => api<PublicPlan[]>('/plans'),
    staleTime: 5 * 60_000,
  });

  const plans = (q.data ?? []).filter((p) => p.interval !== (yearly ? 'month' : 'year'));
  const monthlyOf = (fam: string) =>
    q.data?.find((p) => family(p.id) === fam && p.interval === 'month');
  const hasYearly = q.data?.some((p) => p.interval === 'year') ?? false;

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 py-20 md:py-28">
      <Reveal className="flex flex-col items-start gap-6 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-[60ch] flex-col gap-3">
          <h2
            id="pricing-title"
            className="text-xl font-semibold tracking-tight text-text md:text-2xl"
          >
            Simple pricing in rupees.
          </h2>
          <p className="text-base text-muted">
            Credits are used only when a tailored resume is ready. If something fails, the credit
            comes back.
          </p>
        </div>
        {hasYearly ? (
          <div
            role="radiogroup"
            aria-label="Billing period"
            className="flex rounded-[var(--radius-control)] border border-border bg-surface p-1"
          >
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                role="radio"
                aria-checked={yearly === y}
                onClick={() => setYearly(y)}
                className={cn(
                  'h-8 rounded-[6px] px-3 text-sm transition-colors duration-150',
                  yearly === y
                    ? 'bg-surface-muted font-medium text-text'
                    : 'text-muted hover:text-text',
                )}
              >
                {y ? 'Yearly' : 'Monthly'}
              </button>
            ))}
          </div>
        ) : null}
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {q.isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-96 rounded-[var(--radius-card)]" />
            ))
          : null}
        {q.isError ? (
          <p className="text-sm text-muted sm:col-span-2 lg:col-span-4" role="status">
            Pricing could not be loaded right now. Please refresh the page.
          </p>
        ) : null}
        {plans.map((p, i) => {
          const featured = family(p.id) === 'pro';
          const monthly = monthlyOf(family(p.id));
          const saving = p.interval === 'year' && monthly ? monthly.priceInr * 12 - p.priceInr : 0;
          const per = p.interval === 'month' ? '/month' : p.interval === 'year' ? '/year' : ' once';
          return (
            <Reveal key={p.id} delay={i * 60}>
              <article
                className={cn(
                  'relative flex h-full flex-col gap-6 rounded-[var(--radius-card)] border bg-surface p-6',
                  featured ? 'border-accent shadow-raised' : 'border-border',
                )}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-text">
                      {p.name.replace(/\s*\(yearly\)/i, '')}
                    </h3>
                    {featured ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="flex items-baseline gap-1">
                    <span className="tabular text-2xl font-semibold tracking-tight text-text">
                      {inr(p.priceInr)}
                    </span>
                    {p.priceInr > 0 ? <span className="text-sm text-muted">{per}</span> : null}
                  </p>
                  <p className="tabular h-5 text-xs text-success">
                    {saving > 0 ? `Save ${inr(saving)} a year` : ''}
                  </p>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-text">
                  {features(p).map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-accent-text"
                        strokeWidth={1.75}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button asChild variant={featured ? 'primary' : 'secondary'} className="mt-auto">
                  <Link
                    to={p.priceInr === 0 ? '/login?mode=signup' : `/login?mode=signup&plan=${p.id}`}
                  >
                    {p.priceInr === 0
                      ? SIGNUP_LABEL
                      : `Choose ${p.name.replace(/\s*\(yearly\)/i, '')}`}
                  </Link>
                </Button>
              </article>
            </Reveal>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-subtle">
        Cancel any time in two clicks. Access continues to the end of the period you paid for.
      </p>
    </section>
  );
}
