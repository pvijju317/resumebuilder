import {
  applyTheme,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  OPTIMIZE_STEPS,
  ProgressSteps,
  readTheme,
  ScoreRing,
  Skeleton,
  StrengthMeter,
  Textarea,
  useToast,
  type ThemePref,
} from '@tailor/ui';
import { ArrowRight, FileText, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Wordmark } from '../layout/wordmark.js';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4 border-t border-border pt-8">
      <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2>
      {children}
    </section>
  );
}

const SWATCHES = [
  ['bg', '--bg'],
  ['surface', '--surface'],
  ['surface-muted', '--surface-muted'],
  ['border', '--border'],
  ['text', '--text'],
  ['text-muted', '--text-muted'],
  ['accent', '--accent'],
  ['accent-soft', '--accent-soft'],
  ['success', '--success'],
  ['warning', '--warning'],
  ['danger', '--danger'],
] as const;

const TYPE: [string, string, string][] = [
  ['text-3xl', '48', 'Display'],
  ['text-2xl', '32', 'Page title'],
  ['text-xl', '24', 'Section heading'],
  ['text-lg', '20', 'Card heading'],
  ['text-base', '16', 'Body large'],
  ['text-sm', '14', 'Body'],
  ['text-xs', '12', 'Caption'],
];

export function StyleguidePage() {
  const { toast } = useToast();
  const [theme, setTheme] = useState<ThemePref>(readTheme);
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(56);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % (OPTIMIZE_STEPS.length + 1)), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <h1 className="text-2xl font-semibold tracking-tight text-text">Design system</h1>
          <p className="max-w-xl text-sm text-muted">
            Tokens and components from @tailor/ui. Every colour is a token, so dark mode is a token
            swap.
          </p>
        </div>
        <div
          className="flex gap-1 rounded-[var(--radius-control)] border border-border bg-surface p-1"
          role="radiogroup"
          aria-label="Theme"
        >
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => {
                applyTheme(t);
                setTheme(t);
              }}
              className={`h-8 rounded-[6px] px-3 text-sm capitalize transition-colors duration-150 ${theme === t ? 'bg-surface-muted font-medium text-text' : 'text-muted hover:text-text'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <Section id="colors" title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map(([name, v]) => (
            <div key={name} className="flex flex-col gap-2">
              <div
                className="h-14 rounded-[var(--radius-control)] border border-border"
                style={{ background: `var(${v})` }}
              />
              <code className="text-xs text-muted">{name}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Typography">
        <div className="flex flex-col gap-3">
          {TYPE.map(([cls, px, use]) => (
            <div key={cls} className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="tabular w-24 shrink-0 text-xs text-subtle">
                {px}px · {use}
              </span>
              <span
                className={`${cls} ${Number(px) >= 20 ? 'font-semibold tracking-tight' : ''} text-text`}
              >
                Tailored to the job, true to you
              </span>
            </div>
          ))}
          <p className="tabular text-sm text-muted">
            Tabular figures: 1,204 · 63% · ₹5,00,000 · 18 → 82
          </p>
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">
            <Plus /> Small
          </Button>
          <Button size="lg">
            Tailor resume <ArrowRight />
          </Button>
        </div>
      </Section>

      <Section id="inputs" title="Inputs">
        <div className="grid gap-6 md:grid-cols-3">
          <Field label="Email" hint="We’ll send a 6-digit code.">
            <Input type="email" placeholder="you@example.com" />
          </Field>
          <Field label="Job title" error="Enter a job title">
            <Input defaultValue="" />
          </Field>
          <Field label="Disabled">
            <Input disabled defaultValue="Read only" />
          </Field>
          <Field label="Job description" className="md:col-span-3">
            <Textarea placeholder="Paste the full job description" />
          </Field>
        </div>
      </Section>

      <Section id="data" title="Data visuals">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Score ring</CardTitle>
              <CardDescription>Before → after with delta.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-around gap-6">
              <ScoreRing score={score} />
              <ScoreRing score={84} before={score} />
              <div className="flex w-full justify-center gap-2">
                {[32, 56, 78].map((s) => (
                  <Button key={s} size="sm" variant="secondary" onClick={() => setScore(s)}>
                    Set {s}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Keyword chips</CardTitle>
              <CardDescription>Matched, partial and missing.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Chip state="matched">Python</Chip>
              <Chip state="matched">SQL</Chip>
              <Chip state="partial">A/B testing</Chip>
              <Chip state="missing">dbt</Chip>
              <Chip state="missing">Snowflake</Chip>
              <Chip onRemove={() => toast({ title: 'Removed Tableau' })}>Tableau</Chip>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Vault strength</CardTitle>
              <CardDescription>Rises as metrics are added.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <StrengthMeter value={34} />
              <StrengthMeter value={82} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Optimization progress</CardTitle>
            <CardDescription>
              Used instead of a bare spinner for anything over 2 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressSteps
              steps={OPTIMIZE_STEPS}
              current={step >= OPTIMIZE_STEPS.length ? 'done' : OPTIMIZE_STEPS[step]!.id}
            />
          </CardContent>
        </Card>
      </Section>

      <Section id="feedback" title="Cards, toasts, modal">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Data Analyst · Fabrikam</CardTitle>
              <CardDescription>Austin, TX · Saved 2 days ago</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted">
              Cards use a 1 px border, a subtle shadow and a 12 px radius.
            </CardContent>
            <CardFooter>
              <Button size="sm">Open</Button>
              <Button size="sm" variant="ghost">
                Archive
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => toast({ title: 'Saved to vault', tone: 'success' })}
              >
                Success toast
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast({
                    title: 'Export blocked',
                    description: 'Answer 2 questions first.',
                    tone: 'error',
                  })
                }
              >
                Error toast
              </Button>
              <Button variant="secondary" onClick={() => toast({ title: 'Draft saved' })}>
                Info toast
              </Button>
              <Button variant="secondary" onClick={() => setModal(true)}>
                Open modal
              </Button>
            </CardContent>
          </Card>
        </div>
        <Modal
          open={modal}
          onOpenChange={setModal}
          title="Save this to your vault?"
          description="Your edit will update the source achievement for future resumes."
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(false)}>
                Not now
              </Button>
              <Button onClick={() => setModal(false)}>Save to vault</Button>
            </>
          }
        />
      </Section>

      <Section id="empty" title="Empty and loading states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            icon={<FileText />}
            title="No tailored resumes yet"
            description="Paste a job description to create your first one."
            action={<Button size="sm">New job</Button>}
          />
          <Card>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      </Section>
    </main>
  );
}
