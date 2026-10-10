import type { AnonCheckDto } from '@tailor/shared';
import { Button, EmptyState, ProgressSteps, Skeleton } from '@tailor/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, SearchX } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { SiteFooter, SiteNav } from '../marketing/site-chrome.js';
import { ScorePanel } from './score-panel.js';

const STEPS = [
  { id: 'read', label: 'Reading the job' },
  { id: 'match', label: 'Matching keywords' },
  { id: 'score', label: 'Scoring' },
];

export function CheckResultPage() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['anon-check', id],
    queryFn: () => api<AnonCheckDto>(`/anon/check/${id}`),
    refetchInterval: (s) => (s.state.data?.status === 'pending' ? 2000 : false),
    // Keep going in a background tab, so the result is there when the user comes back.
    refetchIntervalInBackground: true,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70dvh] max-w-[1200px] flex-col gap-8 px-4 py-12 md:px-8">
        {q.isLoading ? (
          <Skeleton className="h-64" />
        ) : q.isError ? (
          <EmptyState
            icon={<SearchX />}
            title="This check is no longer available"
            description="Checks are deleted after 72 hours or when opened in a different browser."
            action={
              <Button asChild>
                <Link to="/#check">Run a new check</Link>
              </Button>
            }
          />
        ) : q.data!.status === 'pending' ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
            <h1 className="text-xl font-semibold tracking-tight text-text">Checking your resume</h1>
            <ProgressSteps steps={STEPS} current="read" />
            <p className="text-sm text-muted">This usually takes under 30 seconds.</p>
          </div>
        ) : q.data!.status === 'failed' ? (
          <EmptyState
            icon={<SearchX />}
            title="We could not read that job"
            description={q.data!.error ?? 'Try pasting the full job description instead of a link.'}
            action={
              <Button asChild>
                <Link to="/#check">Try again</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">ATS check</p>
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                {q.data!.job?.title}
                {q.data!.job?.company ? (
                  <span className="text-muted"> at {q.data!.job.company}</span>
                ) : null}
              </h1>
            </div>
            <ScorePanel ats={q.data!.ats!} />
            <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] bg-accent-soft p-6 md:flex-row md:items-center md:justify-between md:p-8">
              <div className="flex max-w-[52ch] flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight text-text">
                  Tailor your resume to this job
                </h2>
                <p className="text-sm text-muted">
                  Create a free account to build your vault and get a version written for this job,
                  with every fact checked.
                </p>
              </div>
              <Button asChild size="lg">
                <Link to="/login?mode=signup">
                  Start free <ArrowRight />
                </Link>
              </Button>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
