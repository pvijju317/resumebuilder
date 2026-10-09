import { useParams } from 'react-router-dom';
import { SiteFooter, SiteNav } from '../marketing/site-chrome.js';

const TITLES: Record<string, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms of Service',
  refunds: 'Refund Policy',
};

/** Placeholder until the reviewed legal text is supplied (Phase 3). */
export function LegalPage() {
  const { doc = '' } = useParams();
  const title = TITLES[doc] ?? 'Legal';
  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[60dvh] max-w-[720px] flex-col gap-4 px-4 py-20 md:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
        <p className="text-base text-muted">This document will be published here before launch.</p>
      </main>
      <SiteFooter />
    </>
  );
}
