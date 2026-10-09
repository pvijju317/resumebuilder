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
import { Link } from 'react-router-dom';
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
  const hasVault = !!vault.data;
  const firstName = me.data?.name?.split(' ')[0];
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
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  'flex items-start gap-4 rounded-[var(--radius-control)] p-4',
                  i === 0 || (hasVault && i === 1) ? 'bg-surface shadow-card' : '',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[1.5]',
                    i === 0 && hasVault
                      ? 'bg-success-soft text-success'
                      : i === 0
                        ? 'bg-accent text-accent-fg'
                        : 'bg-surface text-muted',
                  )}
                  aria-hidden
                >
                  {i === 0 && hasVault ? <Check /> : <s.icon />}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-sm font-medium text-text">
                    {s.title}
                    {i === 0 ? <span className="sr-only"> (next step)</span> : null}
                  </p>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
                {i === 0 ? (
                  <Button
                    asChild
                    size="sm"
                    variant={hasVault ? 'secondary' : 'primary'}
                    className="ml-auto shrink-0 self-center"
                  >
                    <Link to="/app/vault">
                      {hasVault ? 'Open vault' : 'Start'} <ArrowRight />
                    </Link>
                  </Button>
                ) : i === 1 ? (
                  <Button
                    asChild
                    size="sm"
                    variant={hasVault ? 'primary' : 'secondary'}
                    className="ml-auto shrink-0 self-center"
                  >
                    <Link to="/app/jobs">
                      Add job <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <span className="ml-auto shrink-0 self-center rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                    Opens next release
                  </span>
                )}
              </li>
            ))}
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
