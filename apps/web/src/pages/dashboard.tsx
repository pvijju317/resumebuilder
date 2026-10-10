import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Skeleton,
  StrengthMeter,
} from '@tailor/ui';
import { ArrowRight, Briefcase, Check, FileCheck2, KanbanSquare, Upload } from 'lucide-react';
import type { JobDto } from '@tailor/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useMe } from '../lib/auth.js';
import { useVault } from '../vault/hooks.js';

const STEPS = [
  {
    icon: Upload,
    title: 'Build your Career Vault',
    body: 'Upload your resume and confirm your roles and results.',
  },
  {
    icon: Briefcase,
    title: 'Add a job',
    body: 'Paste a job description or a link to see your match.',
  },
  {
    icon: FileCheck2,
    title: 'Tailor your resume',
    body: 'Get a version written for that job, with every fact checked.',
  },
  {
    icon: KanbanSquare,
    title: 'Track applications',
    body: 'Log where you applied and see which versions get callbacks.',
  },
];

export function DashboardPage() {
  const me = useMe();
  const vault = useVault();
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api<{ items: JobDto[]; nextCursor: string | null }>('/jobs'),
  });
  const firstName = me.data?.name?.split(' ')[0];
  // Steps 3 and 4 open in later releases; only the first two can be done today.
  const done = [!!vault.data, (jobs.data?.items.length ?? 0) > 0, false, false];
  const available = [true, true, false, false];
  const next = done.findIndex((d, i) => !d && available[i]);
  const links = [
    { to: '/app/vault', label: done[0] ? 'Open vault' : 'Start' },
    { to: '/app/jobs', label: done[1] ? 'View jobs' : 'Add job' },
  ];
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        {me.isLoading ? (
          <Skeleton className="h-8 w-56" />
        ) : (
          <h2 className="text-xl font-semibold tracking-tight text-text">
            {firstName ? `Welcome, ${firstName}` : 'Welcome'}
          </h2>
        )}
        <p className="text-sm text-muted">
          Four steps from your current resume to tailored applications.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section
          aria-labelledby="setup-title"
          className="rounded-[var(--radius-card)] bg-accent-soft p-6"
        >
          <h3 id="setup-title" className="text-base font-semibold text-text">
            Get set up
          </h3>
          <ol className="mt-4 flex flex-col gap-2">
            {STEPS.map((s, i) => {
              const link = links[i];
              return (
                <li
                  key={s.title}
                  className={cn(
                    'flex items-start gap-4 rounded-[var(--radius-control)] p-4',
                    i === next && 'bg-surface shadow-card',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[1.5]',
                      done[i]
                        ? 'bg-success-soft text-success'
                        : i === next
                          ? 'bg-accent text-accent-fg'
                          : 'bg-surface text-muted',
                    )}
                    aria-hidden
                  >
                    {done[i] ? <Check /> : <s.icon />}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="text-sm font-medium text-text">
                      {s.title}
                      {done[i] ? <span className="sr-only"> (done)</span> : null}
                      {i === next ? <span className="sr-only"> (next step)</span> : null}
                    </p>
                    <p className="text-sm text-muted">{s.body}</p>
                  </div>
                  {link ? (
                    <Button
                      asChild
                      size="sm"
                      variant={i === next ? 'primary' : 'secondary'}
                      className="ml-auto shrink-0 self-center"
                    >
                      <Link to={link.to}>
                        {link.label} <ArrowRight />
                      </Link>
                    </Button>
                  ) : (
                    <span className="ml-auto shrink-0 self-center rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                      Opens next release
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Career Vault</CardTitle>
            <CardDescription>Strength rises as you add confirmed metrics.</CardDescription>
          </CardHeader>
          <CardContent>
            <StrengthMeter value={vault.data?.strength ?? 0} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
