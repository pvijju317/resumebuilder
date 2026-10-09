import { Button } from '@tailor/ui';
import { Link } from 'react-router-dom';
import { Wordmark } from '../layout/wordmark.js';
import { useAuth } from '../lib/auth.js';
import { SIGNUP_LABEL } from './sections.js';

const LINKS = [
  ['ATS check', '/#check'],
  ['How it works', '/#how'],
  ['Fact Guard', '/#fact-guard'],
  ['Pricing', '/#pricing'],
  ['FAQ', '/#faq'],
] as const;

export function SiteNav() {
  const { status } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-4 md:px-8">
        <Link to="/" aria-label="Tailor home">
          <Wordmark />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-6 md:flex">
          {LINKS.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm text-muted transition-colors duration-150 hover:text-text"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {status === 'authed' ? (
            <Button asChild size="sm">
              <Link to="/app">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/login?mode=signup">{SIGNUP_LABEL}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const cols: [string, [string, string][]][] = [
    [
      'Product',
      [
        ['How it works', '/#how'],
        ['Pricing', '/#pricing'],
        ['FAQ', '/#faq'],
      ],
    ],
    [
      'Legal',
      [
        ['Privacy', '/legal/privacy'],
        ['Terms', '/legal/terms'],
        ['Refunds', '/legal/refunds'],
      ],
    ],
  ];
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-[36ch] text-sm text-muted">
            Resumes tailored to each job, built only from experience you have confirmed.
          </p>
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title} className="flex flex-col gap-3">
            <p className="text-sm font-medium text-text">{title}</p>
            {links.map(([label, href]) => (
              <Link
                key={href}
                to={href}
                className="text-sm text-muted transition-colors duration-150 hover:text-text"
              >
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-[1200px] px-4 pb-10 text-xs text-subtle md:px-8">
        © {new Date().getFullYear()} Melchizedek Technologies Pvt Ltd
      </div>
    </footer>
  );
}
