import type { AtsScoreDto, JobDto, Keyword } from '@tailor/shared';
import {
  Button,
  Card,
  CardContent,
  Chip,
  EmptyState,
  Field,
  Input,
  ProgressSteps,
  Skeleton,
  Textarea,
  cn,
  useToast,
} from '@tailor/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, ExternalLink, Plus, RotateCcw, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ScorePanel } from '../check/score-panel.js';
import { api, ApiError } from '../lib/api.js';

const msg = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

export function JobsPage() {
  const q = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api<{ items: JobDto[]; nextCursor: string | null }>('/jobs'),
  });
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-text">Jobs</h2>
          <p className="text-sm text-muted">Add a job to see how your vault matches it.</p>
        </div>
        {!adding ? (
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add job
          </Button>
        ) : null}
      </div>
      {adding ? <NewJob onCancel={() => setAdding(false)} /> : null}
      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : q.data?.items.length ? (
        <Card>
          <ul className="divide-y divide-border">
            {q.data.items.map((j) => (
              <li key={j.id}>
                <Link
                  to={`/app/jobs/${j.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {j.extraction?.title ??
                        (j.status === 'failed' ? 'Could not read this job' : 'Reading job…')}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {[j.extraction?.company, j.extraction?.location]
                        .filter(Boolean)
                        .join(' · ') ||
                        j.sourceUrl ||
                        'Pasted description'}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-xs text-subtle">
                    {new Date(j.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : !adding ? (
        <EmptyState
          icon={<Briefcase />}
          title="No jobs yet"
          description="Paste a job description or a link to get started."
          action={<Button onClick={() => setAdding(true)}>Add job</Button>}
        />
      ) : null}
    </div>
  );
}

function NewJob({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'paste' | 'url'>('paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<JobDto>('/jobs', {
        method: 'POST',
        body: mode === 'url' ? { url: url.trim() } : { text },
      }),
    onSuccess: (j) => {
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/app/jobs/${j.id}`);
    },
    onError: (e) => setError(msg(e)),
  });
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Job input"
          className="flex w-fit rounded-[var(--radius-control)] bg-surface-muted p-0.5"
        >
          {(['paste', 'url'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-8 rounded-[6px] px-3 text-sm',
                mode === m
                  ? 'bg-surface font-medium text-text shadow-card'
                  : 'text-muted hover:text-text',
              )}
            >
              {m === 'paste' ? 'Paste description' : 'Link'}
            </button>
          ))}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
        >
          {mode === 'paste' ? (
            <Field label="Job description">
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the full job description"
              />
            </Field>
          ) : (
            <Field
              label="Job link"
              hint="If the site blocks reading, paste the description instead."
            >
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
          )}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="submit"
              loading={create.isPending}
              disabled={
                mode === 'paste'
                  ? text.trim().length < 200
                  : !/^https?:\/\/\S+\.\S+/.test(url.trim())
              }
            >
              Add job
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ChipEditor({
  title,
  items,
  onChange,
  disabled,
}: {
  title: string;
  items: Keyword[];
  onChange: (k: Keyword[]) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const add = () => {
    const name = value.trim();
    if (name && !items.some((k) => k.name.toLowerCase() === name.toLowerCase()))
      onChange([...items, { name, aliases: [] }]);
    setValue('');
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((k) => (
          <Chip
            key={k.name}
            onRemove={disabled ? undefined : () => onChange(items.filter((x) => x.name !== k.name))}
          >
            {k.name}
          </Chip>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          aria-label={`Add to ${title.toLowerCase()}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a skill"
          className="h-8 max-w-56"
          disabled={disabled}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={disabled || !value.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

export function JobPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { toast } = useToast();
  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => api<JobDto>(`/jobs/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 2000 : false),
  });
  const ready = job.data?.status === 'ready';
  const match = useQuery({
    queryKey: ['job', id, 'match'],
    queryFn: async () => {
      try {
        return await api<AtsScoreDto | null>(`/jobs/${id}/match`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return 'no-vault' as const;
        throw e;
      }
    },
    enabled: ready,
  });
  const save = useMutation({
    mutationFn: (body: { mustHave?: Keyword[]; niceToHave?: Keyword[] } | 'reset') =>
      body === 'reset'
        ? api<JobDto>(`/jobs/${id}/overrides`, { method: 'DELETE' })
        : api<JobDto>(`/jobs/${id}`, { method: 'PATCH', body }),
    onSuccess: (j) => {
      qc.setQueryData(['job', id], j);
      void qc.invalidateQueries({ queryKey: ['job', id, 'match'] });
    },
    onError: (e) => toast({ title: msg(e), tone: 'error' }),
  });

  if (job.isLoading) return <Skeleton className="h-64" />;
  if (job.isError || !job.data)
    return (
      <EmptyState
        title="Job not found"
        action={
          <Button asChild>
            <Link to="/app/jobs">Back to jobs</Link>
          </Button>
        }
      />
    );
  const j = job.data;
  const e = j.extraction;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/app/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden /> All jobs
      </Link>
      {j.status === 'pending' ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-text">Reading the job</h2>
            <ProgressSteps
              steps={[
                { id: 'read', label: 'Reading' },
                { id: 'extract', label: 'Finding requirements' },
                { id: 'done', label: 'Ready' },
              ]}
              current="extract"
            />
          </CardContent>
        </Card>
      ) : j.status === 'failed' || !e ? (
        <EmptyState
          title="We could not read this job"
          description={j.error ?? 'Try adding it again with the pasted description.'}
          action={
            <Button asChild>
              <Link to="/app/jobs">Back to jobs</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold tracking-tight text-text">{e.title}</h2>
              <p className="text-sm text-muted">
                {[
                  e.company,
                  e.location,
                  e.seniority !== 'unknown' ? e.seniority : null,
                  e.employmentType,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {j.sourceUrl ? (
              <Button asChild variant="ghost" size="sm">
                <a href={j.sourceUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Original posting
                </a>
              </Button>
            ) : null}
          </div>
          <Card>
            <CardContent className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-text">What this job asks for</h3>
                {j.edited ? (
                  <Button variant="ghost" size="sm" onClick={() => save.mutate('reset')}>
                    <RotateCcw /> Reset to original
                  </Button>
                ) : null}
              </div>
              <p className="-mt-3 text-sm text-muted">
                Remove anything that is not really required, or add what we missed. Your score
                updates as you edit.
              </p>
              <ChipEditor
                title="Required"
                items={e.mustHave}
                disabled={save.isPending}
                onChange={(mustHave) => save.mutate({ mustHave })}
              />
              <ChipEditor
                title="Nice to have"
                items={e.niceToHave}
                disabled={save.isPending}
                onChange={(niceToHave) => save.mutate({ niceToHave })}
              />
            </CardContent>
          </Card>
          <section aria-label="Match" className="flex flex-col gap-3">
            <h3 className="text-base font-semibold text-text">Your match</h3>
            {match.isLoading ? (
              <Skeleton className="h-48" />
            ) : match.data === 'no-vault' ? (
              <EmptyState
                icon={<Upload />}
                title="Build your vault to see your match"
                description="Your score uses the roles and achievements in your Career Vault."
                action={
                  <Button asChild>
                    <Link to="/app/vault">Build your vault</Link>
                  </Button>
                }
              />
            ) : match.data ? (
              <ScorePanel ats={match.data} />
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
