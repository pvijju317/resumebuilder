import { Button } from '@tailor/ui';
import { ArrowRight, Globe, MousePointerClick, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CheckForm } from '../check/check-form.js';
import { Faq } from '../marketing/faq.js';
import { HeroDemo } from '../marketing/hero-demo.js';
import { Pricing } from '../marketing/pricing.js';
import { Reveal } from '../marketing/reveal.js';
import {
  FactGuardSection,
  FinalCta,
  HowItWorks,
  Regions,
  SIGNUP_LABEL,
  WhereYouApply,
} from '../marketing/sections.js';
import { SiteFooter, SiteNav } from '../marketing/site-chrome.js';

const PROOF = [
  [ShieldCheck, 'Every fact checked against your vault'],
  [Globe, 'Formats for India, US, UK and Europe'],
  [MousePointerClick, 'You always press submit'],
] as const;

export function LandingPage() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="mx-auto max-w-[1200px] px-4 md:px-8">
        <section
          aria-labelledby="hero-title"
          className="grid items-center gap-12 pt-12 pb-16 md:pt-16 lg:grid-cols-[1fr_1.05fr] lg:pt-24 lg:pb-28"
        >
          <div className="flex flex-col items-start gap-6 animate-[hero-in_600ms_var(--ease-out)_both]">
            <h1
              id="hero-title"
              className="text-2xl font-semibold tracking-[-0.03em] text-text sm:text-3xl"
            >
              Your real experience, <span className="text-accent-text">tailored to every job.</span>
            </h1>
            <p className="max-w-[44ch] text-base text-muted md:text-lg">
              Build a verified Career Vault once. Tailor writes an ATS-ready resume for each job,
              without inventing anything.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <a href="#check">
                  Check my ATS score <ArrowRight />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link to="/login?mode=signup">{SIGNUP_LABEL}</Link>
              </Button>
            </div>
          </div>
          <div className="relative animate-[hero-in_700ms_var(--ease-out)_120ms_both]">
            {/* Solid tinted frame behind the live preview: depth without gradients. */}
            <div
              aria-hidden
              className="absolute inset-0 translate-x-3 translate-y-3 rounded-[var(--radius-card)] bg-accent-soft sm:translate-x-5 sm:translate-y-5"
            />
            <div className="relative">
              <HeroDemo />
            </div>
          </div>
        </section>

        <Reveal>
          <ul className="grid gap-4 border-y border-border py-6 sm:grid-cols-3">
            {PROOF.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-sm text-text">
                <Icon aria-hidden className="size-5 shrink-0 text-accent-text" strokeWidth={1.5} />
                {text}
              </li>
            ))}
          </ul>
        </Reveal>

        <section id="check" aria-labelledby="check-title" className="scroll-mt-24 pt-20 md:pt-28">
          <Reveal className="mb-8 flex max-w-[60ch] flex-col gap-3">
            <h2
              id="check-title"
              className="text-xl font-semibold tracking-tight text-text md:text-2xl"
            >
              Check your resume against a job.
            </h2>
            <p className="text-base text-muted">
              Add both and see your ATS score in under a minute. No account needed.
            </p>
          </Reveal>
          <CheckForm />
        </section>

        <HowItWorks />
        <FactGuardSection />
        <Regions />
        <WhereYouApply />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
