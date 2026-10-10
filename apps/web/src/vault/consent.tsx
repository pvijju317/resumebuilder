import { Button, Card, CardContent } from '@tailor/ui';
import { ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConsent } from './hooks.js';

/** DPDP consent before any resume is processed by AI. Model improvement is opt-in, off by default. */
export function ConsentCard() {
  const consent = useConsent();
  const [agree, setAgree] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const agreeId = useId();
  const optId = useId();
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <ShieldCheck
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-accent-text"
            strokeWidth={1.5}
          />
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-text">Before you upload</h2>
            <p className="text-sm text-muted">Here is exactly how your resume is used.</p>
          </div>
        </div>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-text marker:text-subtle">
          <li>
            An AI model reads your resume to build your vault. Your email, phone and address are
            removed first.
          </li>
          <li>Your data is used only to build and tailor your resumes.</li>
          <li>Export and deletion of your data are coming to Settings before launch.</li>
        </ul>
        <label htmlFor={agreeId} className="flex items-start gap-3 text-sm text-text">
          <input
            id={agreeId}
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          I agree to AI processing of my resume as described above and in the{' '}
          <Link to="/legal/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </label>
        <label htmlFor={optId} className="flex items-start gap-3 text-sm text-muted">
          <input
            id={optId}
            type="checkbox"
            checked={optIn}
            onChange={(e) => setOptIn(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          Optional: allow my anonymized data to be used to improve Tailor&rsquo;s models.
        </label>
        <div>
          <Button
            disabled={!agree}
            loading={consent.isPending}
            onClick={() => consent.mutate(optIn)}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
