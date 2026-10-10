import type { VaultDraft, VaultImportDto } from '@tailor/shared';
import {
  Button,
  Card,
  CardContent,
  Chip,
  cn,
  DateField,
  Field,
  Input,
  Textarea,
  useToast,
} from '@tailor/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../lib/api.js';
import { vaultKeys } from './hooks.js';

const LOW = 0.7;

function Flag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
      <AlertTriangle aria-hidden className="size-3.5" strokeWidth={1.75} /> Please check
    </span>
  );
}

export function ReviewImport({ imp }: { imp: VaultImportDto & { draft: VaultDraft } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<VaultDraft>(imp.draft);
  const [skip, setSkip] = useState<Set<number>>(new Set(imp.duplicateRoleIndexes));
  const [error, setError] = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: () => {
      // Drop blank achievement rows the user added but never filled in.
      const clean = structuredClone(draft);
      clean.roles.forEach(
        (r) => (r.achievements = r.achievements.filter((a) => a.text.trim().length > 0)),
      );
      return api<{ vaultId: string }>(`/vault/imports/${imp.id}/confirm`, {
        method: 'POST',
        body: { draft: clean, skipRoleIndexes: [...skip] },
      });
    },
    onSuccess: async () => {
      toast({
        title: 'Vault saved',
        description: 'Next: a few questions to add numbers to your achievements.',
        tone: 'success',
      });
      qc.setQueryData(vaultKeys.latestImport, null);
      await qc.invalidateQueries({ queryKey: vaultKeys.vault });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Could not save. Please try again.'),
  });

  const set = (fn: (d: VaultDraft) => void) =>
    setDraft((d) => {
      const copy = structuredClone(d);
      fn(copy);
      return copy;
    });
  const missingStart = draft.roles.some((r, i) => !skip.has(i) && !r.startDate);

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-text">Review your vault</h2>
        <p className="text-sm text-muted">
          Check what we found. Fix anything that is wrong; nothing is saved until you confirm.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              value={draft.profile.name}
              onChange={(e) => set((d) => void (d.profile.name = e.target.value))}
            />
          </Field>
          <Field label="Headline">
            <Input
              value={draft.profile.headline ?? ''}
              onChange={(e) => set((d) => void (d.profile.headline = e.target.value))}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={draft.profile.email ?? ''}
              onChange={(e) => set((d) => void (d.profile.email = e.target.value))}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={draft.profile.phone ?? ''}
              onChange={(e) => set((d) => void (d.profile.phone = e.target.value))}
            />
          </Field>
          <Field label="Location" className="sm:col-span-2">
            <Input
              value={draft.profile.location ?? ''}
              onChange={(e) => set((d) => void (d.profile.location = e.target.value))}
            />
          </Field>
          {draft.profile.summary != null ? (
            <Field label="Summary" className="sm:col-span-2">
              <Textarea
                rows={4}
                value={draft.profile.summary}
                onChange={(e) => set((d) => void (d.profile.summary = e.target.value))}
              />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="exp-title" className="flex flex-col gap-3">
        <h3 id="exp-title" className="text-base font-semibold text-text">
          Experience <span className="tabular font-normal text-subtle">({draft.roles.length})</span>
        </h3>
        {draft.roles.map((r, i) => {
          const skipped = skip.has(i);
          const dup = imp.duplicateRoleIndexes.includes(i);
          return (
            <Card key={i} className={cn(skipped && 'opacity-60')}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Flag show={r.confidence < LOW} />
                  {dup ? (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted">
                      Already in your vault
                    </span>
                  ) : null}
                  <label className="ml-auto flex items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={skipped}
                      onChange={(e) =>
                        setSkip((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(i);
                          else n.delete(i);
                          return n;
                        })
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                    Skip this role
                  </label>
                </div>
                {skipped ? (
                  <p className="text-sm text-text">
                    {r.title}, {r.company}
                  </p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Job title">
                        <Input
                          value={r.title}
                          onChange={(e) => set((d) => void (d.roles[i]!.title = e.target.value))}
                        />
                      </Field>
                      <Field label="Company">
                        <Input
                          value={r.company}
                          onChange={(e) => set((d) => void (d.roles[i]!.company = e.target.value))}
                        />
                      </Field>
                      <DateField
                        label="Start"
                        value={r.startDate}
                        onChange={(v) => set((d) => void (d.roles[i]!.startDate = v))}
                      />
                      <DateField
                        label="End"
                        value={r.endDate}
                        presentLabel="I work here now"
                        onChange={(v) => set((d) => void (d.roles[i]!.endDate = v))}
                      />
                    </div>
                    {!r.startDate ? (
                      <p className="text-xs text-danger">Add a start year to save this role.</p>
                    ) : null}
                    <div className="flex flex-col gap-3">
                      <p className="text-sm font-medium text-text">Achievements</p>
                      {r.achievements.map((a, j) => (
                        <div
                          key={j}
                          className={cn(
                            'flex flex-col gap-2 rounded-[var(--radius-control)] border p-3',
                            a.confidence < LOW ? 'border-warning' : 'border-border',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <Textarea
                              aria-label={`Achievement ${j + 1}`}
                              value={a.text}
                              rows={2}
                              className="min-h-0"
                              onChange={(e) =>
                                set(
                                  (d) => void (d.roles[i]!.achievements[j]!.text = e.target.value),
                                )
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Remove achievement"
                              onClick={() => set((d) => void d.roles[i]!.achievements.splice(j, 1))}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          {a.metrics.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {a.metrics.map((m, k) => (
                                <Chip key={k} state="matched">
                                  {m.unit === '%'
                                    ? `${m.value}%`
                                    : `${m.value.toLocaleString('en-IN')} ${m.unit}`}
                                </Chip>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          set(
                            (d) =>
                              void d.roles[i]!.achievements.push({
                                text: '',
                                metrics: [],
                                skills: [],
                                impactType: [],
                                confidence: 1,
                              }),
                          )
                        }
                      >
                        <Plus /> Add achievement
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {draft.education.length || draft.certifications.length || draft.projects.length ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            {draft.projects.length ? (
              <List title="Projects" items={draft.projects.map((p) => p.name)} />
            ) : null}
            {draft.education.length ? (
              <List
                title="Education"
                items={draft.education.map((e) =>
                  [e.degree, e.institution].filter(Boolean).join(', '),
                )}
              />
            ) : null}
            {draft.certifications.length ? (
              <List title="Certifications" items={draft.certifications.map((c) => c.name)} />
            ) : null}
            <p className="text-xs text-subtle">You can edit these in detail after saving.</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium text-text">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.skills.map((s, i) => (
              <Chip key={`${s.name}-${i}`} onRemove={() => set((d) => void d.skills.splice(i, 1))}>
                {s.name}
              </Chip>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/90 backdrop-blur md:left-60">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <p className="text-sm text-muted" role="status">
            {error ??
              (missingStart
                ? 'Some roles need a start month.'
                : `${draft.roles.length - skip.size} roles will be saved.`)}
          </p>
          <Button
            loading={confirm.isPending}
            disabled={missingStart}
            onClick={() => confirm.mutate()}
          >
            Confirm and save
          </Button>
        </div>
      </div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-text">{title}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-text marker:text-subtle">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
