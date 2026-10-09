import { formatVaultDate } from '@tailor/core';
import type { AchievementDto, VaultDto } from '@tailor/shared';
import {
  Button,
  Card,
  CardContent,
  Chip,
  cn,
  EmptyState,
  Field,
  Input,
  Modal,
  StrengthMeter,
  Textarea,
  useToast,
} from '@tailor/ui';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FileUp,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useVaultMutation } from './hooks.js';

type Kind = 'roles' | 'projects' | 'education' | 'certs' | 'skills';
type FieldDef = {
  name: string;
  label: string;
  type?: 'text' | 'month' | 'textarea';
  required?: boolean;
  span?: boolean;
};

const FIELDS: Record<Kind, FieldDef[]> = {
  roles: [
    { name: 'title', label: 'Job title', required: true },
    { name: 'company', label: 'Company', required: true },
    { name: 'location', label: 'Location' },
    { name: 'type', label: 'Employment type' },
    { name: 'startDate', label: 'Start', type: 'month', required: true },
    { name: 'endDate', label: 'End (leave empty if current)', type: 'month' },
    { name: 'scope', label: 'Scope', type: 'textarea', span: true },
  ],
  projects: [
    { name: 'name', label: 'Project name', required: true },
    { name: 'role', label: 'Your role' },
    { name: 'url', label: 'Link', span: true },
    { name: 'startDate', label: 'Start', type: 'month' },
    { name: 'endDate', label: 'End', type: 'month' },
    { name: 'summary', label: 'Summary', type: 'textarea', span: true },
  ],
  education: [
    { name: 'institution', label: 'Institution', required: true, span: true },
    { name: 'degree', label: 'Degree' },
    { name: 'field', label: 'Field of study' },
    { name: 'startDate', label: 'Start', type: 'month' },
    { name: 'endDate', label: 'End', type: 'month' },
    { name: 'grade', label: 'Grade' },
  ],
  certs: [
    { name: 'name', label: 'Certification', required: true, span: true },
    { name: 'issuer', label: 'Issuer' },
    { name: 'date', label: 'Date', type: 'month' },
    { name: 'url', label: 'Link', span: true },
  ],
  skills: [{ name: 'name', label: 'Skill', required: true, span: true }],
};
const SINGULAR: Record<Kind, string> = {
  roles: 'role',
  projects: 'project',
  education: 'education',
  certs: 'certification',
  skills: 'skill',
};

const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Could not save. Please try again.';
/** "Feb 2023 to Present" (display only; stored as YYYY-MM). */
const range = (s: string | null, e: string | null) =>
  s
    ? `${formatVaultDate(s, 'US')} to ${formatVaultDate(e, 'US')}`
    : e
      ? formatVaultDate(e, 'US')
      : '';

/** Generic create/edit form for the simple vault entities. */
function EntityModal({
  kind,
  initial,
  onClose,
  onSave,
  saving,
  error,
}: {
  kind: Kind;
  initial: Record<string, unknown> | null;
  onClose: () => void;
  onSave: (v: Record<string, unknown>) => void;
  saving: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      FIELDS[kind].map((f) => [f.name, initial?.[f.name] == null ? '' : String(initial[f.name])]),
    ),
  );
  const missing = FIELDS[kind].some((f) => f.required && !values[f.name]?.trim());
  const submit = () =>
    onSave(
      Object.fromEntries(
        FIELDS[kind].map((f) => [
          f.name,
          values[f.name]?.trim() ? values[f.name]!.trim() : f.required ? '' : null,
        ]),
      ),
    );
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${initial ? 'Edit' : 'Add'} ${SINGULAR[kind]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={missing} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing) submit();
        }}
      >
        {FIELDS[kind].map((f) => (
          <Field key={f.name} label={f.label} className={cn(f.span && 'sm:col-span-2')}>
            {f.type === 'textarea' ? (
              <Textarea
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                rows={3}
              />
            ) : (
              <Input
                type={f.type === 'month' ? 'month' : 'text'}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </Field>
        ))}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function AchievementModal({
  initial,
  onClose,
  onSave,
  saving,
  error,
}: {
  initial: AchievementDto | null;
  onClose: () => void;
  onSave: (text: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial ? 'Edit achievement' : 'Add achievement'}
      description="Describe what you did and the result. Include numbers you can stand behind."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={text.trim().length < 3}
            onClick={() => onSave(text.trim())}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Achievement">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

const PROFILE_FIELDS: {
  name: 'name' | 'headline' | 'email' | 'phone' | 'location' | 'workAuth';
  label: string;
}[] = [
  { name: 'name', label: 'Full name' },
  { name: 'headline', label: 'Headline' },
  { name: 'email', label: 'Email' },
  { name: 'phone', label: 'Phone' },
  { name: 'location', label: 'Location' },
  { name: 'workAuth', label: 'Work authorization (optional)' },
];

function ProfileModal({
  profile,
  onClose,
  onSave,
  saving,
  error,
}: {
  profile: VaultDto['profile'];
  onClose: () => void;
  onSave: (v: Record<string, string | null>) => void;
  saving: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROFILE_FIELDS.map((f) => [f.name, profile[f.name] ?? ''])),
  );
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit profile"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            disabled={!values['name']?.trim()}
            onClick={() =>
              onSave(
                Object.fromEntries(
                  PROFILE_FIELDS.map((f) => [
                    f.name,
                    values[f.name]?.trim() || (f.name === 'name' ? '' : null),
                  ]),
                ),
              )
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PROFILE_FIELDS.map((f) => (
          <Field key={f.name} label={f.label}>
            <Input
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function RowActions({
  hidden,
  onToggle,
  onEdit,
  onDelete,
  onUp,
  onDown,
  label,
}: {
  hidden: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center">
      {onUp ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Move ${label} up`}
          onClick={onUp}
        >
          <ArrowUp />
        </Button>
      ) : null}
      {onDown ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Move ${label} down`}
          onClick={onDown}
        >
          <ArrowDown />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        aria-pressed={hidden}
        onClick={onToggle}
      >
        {hidden ? <EyeOff /> : <Eye />}
      </Button>
      {onEdit ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Edit ${label}`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label={`Delete ${label}`}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function Section({
  title,
  count,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  addLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text">
          {title} <span className="tabular font-normal text-subtle">({count})</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdd} aria-label={addLabel}>
          <Plus /> Add
        </Button>
      </div>
      {children}
    </section>
  );
}

function swap<T>(arr: T[], i: number, j: number) {
  const a = [...arr];
  [a[i], a[j]] = [a[j]!, a[i]!];
  return a;
}

type Editing =
  | { kind: Kind; id: string | null }
  | { kind: 'achievement'; id: string | null; parent: { roleId?: string; projectId?: string } }
  | null;

export function VaultEditor({ vault, onImport }: { vault: VaultDto; onImport: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ path: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const save = useVaultMutation((v: { path: string; method: string; body?: unknown }) =>
    api<VaultDto>(v.path, { method: v.method, body: v.body }),
  );
  const run = (path: string, method: string, body?: unknown, done?: () => void) => {
    setError(null);
    save.mutate(
      { path, method, body },
      {
        onSuccess: () => done?.(),
        onError: (e) =>
          editing ? setError(errMsg(e)) : toast({ title: errMsg(e), tone: 'error' }),
      },
    );
  };
  const reorder = (kind: Kind | 'achievements', ids: string[], parentId?: string) =>
    run('/vault/reorder', 'POST', { kind, ids, parentId });
  const close = () => {
    setEditing(null);
    setError(null);
  };

  const entityList = <T extends { id: string; hidden: boolean }>(
    kind: Kind,
    items: T[],
    render: (x: T) => ReactNode,
  ) =>
    items.length === 0 ? (
      <p className="text-sm text-subtle">Nothing here yet.</p>
    ) : (
      <Card>
        <ul className="divide-y divide-border">
          {items.map((x, i) => (
            <li
              key={x.id}
              className={cn('flex items-start gap-3 px-4 py-3', x.hidden && 'opacity-60')}
            >
              <div className="min-w-0 flex-1">{render(x)}</div>
              <RowActions
                label={SINGULAR[kind]}
                hidden={x.hidden}
                onToggle={() => run(`/vault/${kind}/${x.id}`, 'PATCH', { hidden: !x.hidden })}
                onEdit={kind === 'skills' ? undefined : () => setEditing({ kind, id: x.id })}
                onDelete={() =>
                  setConfirmDelete({ path: `/vault/${kind}/${x.id}`, label: SINGULAR[kind] })
                }
                onUp={
                  i > 0
                    ? () =>
                        reorder(
                          kind,
                          swap(items, i, i - 1).map((y) => y.id),
                        )
                    : undefined
                }
                onDown={
                  i < items.length - 1
                    ? () =>
                        reorder(
                          kind,
                          swap(items, i, i + 1).map((y) => y.id),
                        )
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      </Card>
    );

  const achievements = (
    list: AchievementDto[],
    parent: { roleId?: string; projectId?: string },
    parentId: string,
  ) => (
    <ul className="flex flex-col gap-2">
      {list.map((a, i) => (
        <li
          key={a.id}
          className={cn(
            'flex items-start gap-2 rounded-[var(--radius-control)] bg-surface-muted px-3 py-2',
            a.hidden && 'opacity-60',
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-sm text-text">{a.text}</p>
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
            ) : (
              <p className="text-xs text-subtle">No numbers yet</p>
            )}
          </div>
          <RowActions
            label="achievement"
            hidden={a.hidden}
            onToggle={() => run(`/vault/achievements/${a.id}`, 'PATCH', { hidden: !a.hidden })}
            onEdit={() => setEditing({ kind: 'achievement', id: a.id, parent })}
            onDelete={() =>
              setConfirmDelete({ path: `/vault/achievements/${a.id}`, label: 'achievement' })
            }
            onUp={
              i > 0
                ? () =>
                    reorder(
                      'achievements',
                      swap(list, i, i - 1).map((y) => y.id),
                      parentId,
                    )
                : undefined
            }
            onDown={
              i < list.length - 1
                ? () =>
                    reorder(
                      'achievements',
                      swap(list, i, i + 1).map((y) => y.id),
                      parentId,
                    )
                : undefined
            }
          />
        </li>
      ))}
      <li>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing({ kind: 'achievement', id: null, parent })}
        >
          <Plus /> Add achievement
        </Button>
      </li>
    </ul>
  );

  const editingEntity =
    editing && editing.kind !== 'achievement' && editing.id
      ? ((vault[editing.kind] as { id: string }[]).find((x) => x.id === editing.id) ?? null)
      : null;
  const editingAchievement =
    editing?.kind === 'achievement' && editing.id
      ? ([...vault.roles, ...vault.projects]
          .flatMap((r) => r.achievements)
          .find((a) => a.id === editing.id) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight text-text">
              {vault.profile.name || 'Your vault'}
            </h2>
            <p className="text-sm text-muted">
              {vault.profile.headline || 'Add a headline in your profile.'}
            </p>
            <p className="text-sm text-subtle">
              {[vault.profile.email, vault.profile.phone, vault.profile.location]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditingProfile(true)}>
                <Pencil /> Edit profile
              </Button>
              <Button variant="secondary" size="sm" onClick={onImport}>
                <FileUp /> Import another resume
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(vault.openGapQuestions > 0 && 'bg-accent-soft border-transparent')}>
          <CardContent className="flex flex-col gap-4">
            <StrengthMeter value={vault.strength} />
            {vault.openGapQuestions > 0 ? (
              <Button asChild>
                <Link to="/app/vault/strengthen">
                  <Sparkles /> Strengthen your vault ({vault.openGapQuestions})
                </Link>
              </Button>
            ) : (
              <p className="text-sm text-muted">
                Add numbers to achievements to raise your strength.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Section
        title="Experience"
        addLabel="Add role"
        count={vault.roles.length}
        onAdd={() => setEditing({ kind: 'roles', id: null })}
      >
        {vault.roles.length === 0 ? (
          <EmptyState title="No roles yet" description="Add your work experience, newest first." />
        ) : (
          vault.roles.map((r, i) => (
            <Card key={r.id} className={cn(r.hidden && 'opacity-60')}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-text">{r.title}</p>
                    <p className="text-sm text-muted">
                      {r.company}
                      {r.location ? `, ${r.location}` : ''}
                    </p>
                    <p className="tabular text-xs text-subtle">{range(r.startDate, r.endDate)}</p>
                  </div>
                  <RowActions
                    label="role"
                    hidden={r.hidden}
                    onToggle={() => run(`/vault/roles/${r.id}`, 'PATCH', { hidden: !r.hidden })}
                    onEdit={() => setEditing({ kind: 'roles', id: r.id })}
                    onDelete={() =>
                      setConfirmDelete({
                        path: `/vault/roles/${r.id}`,
                        label: 'role and its achievements',
                      })
                    }
                    onUp={
                      i > 0
                        ? () =>
                            reorder(
                              'roles',
                              swap(vault.roles, i, i - 1).map((y) => y.id),
                            )
                        : undefined
                    }
                    onDown={
                      i < vault.roles.length - 1
                        ? () =>
                            reorder(
                              'roles',
                              swap(vault.roles, i, i + 1).map((y) => y.id),
                            )
                        : undefined
                    }
                  />
                </div>
                {achievements(r.achievements, { roleId: r.id }, r.id)}
              </CardContent>
            </Card>
          ))
        )}
      </Section>

      <Section
        title="Projects"
        addLabel="Add project"
        count={vault.projects.length}
        onAdd={() => setEditing({ kind: 'projects', id: null })}
      >
        {vault.projects.map((p, i) => (
          <Card key={p.id} className={cn(p.hidden && 'opacity-60')}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-text">{p.name}</p>
                  {p.summary ? <p className="text-sm text-muted">{p.summary}</p> : null}
                </div>
                <RowActions
                  label="project"
                  hidden={p.hidden}
                  onToggle={() => run(`/vault/projects/${p.id}`, 'PATCH', { hidden: !p.hidden })}
                  onEdit={() => setEditing({ kind: 'projects', id: p.id })}
                  onDelete={() =>
                    setConfirmDelete({ path: `/vault/projects/${p.id}`, label: 'project' })
                  }
                  onUp={
                    i > 0
                      ? () =>
                          reorder(
                            'projects',
                            swap(vault.projects, i, i - 1).map((y) => y.id),
                          )
                      : undefined
                  }
                  onDown={
                    i < vault.projects.length - 1
                      ? () =>
                          reorder(
                            'projects',
                            swap(vault.projects, i, i + 1).map((y) => y.id),
                          )
                      : undefined
                  }
                />
              </div>
              {achievements(p.achievements, { projectId: p.id }, p.id)}
            </CardContent>
          </Card>
        ))}
      </Section>

      <Section
        title="Education"
        addLabel="Add education"
        count={vault.education.length}
        onAdd={() => setEditing({ kind: 'education', id: null })}
      >
        {entityList('education', vault.education, (e) => (
          <>
            <p className="text-sm font-medium text-text">
              {[e.degree, e.field].filter(Boolean).join(', ') || e.institution}
            </p>
            <p className="text-sm text-muted">{e.institution}</p>
          </>
        ))}
      </Section>

      <Section
        title="Certifications"
        addLabel="Add certification"
        count={vault.certs.length}
        onAdd={() => setEditing({ kind: 'certs', id: null })}
      >
        {entityList('certs', vault.certs, (c) => (
          <>
            <p className="text-sm font-medium text-text">{c.name}</p>
            <p className="text-sm text-muted">{[c.issuer, c.date].filter(Boolean).join(' · ')}</p>
          </>
        ))}
      </Section>

      <Section
        title="Skills"
        addLabel="Add skill"
        count={vault.skills.length}
        onAdd={() => setEditing({ kind: 'skills', id: null })}
      >
        <div className="flex flex-wrap gap-1.5">
          {vault.skills.map((s) => (
            <span key={s.id} className={cn(s.hidden && 'opacity-60')}>
              <Chip onRemove={() => run(`/vault/skills/${s.id}`, 'DELETE')}>{s.name}</Chip>
            </span>
          ))}
        </div>
      </Section>

      {editing && editing.kind !== 'achievement' ? (
        <EntityModal
          kind={editing.kind}
          initial={editingEntity as Record<string, unknown> | null}
          saving={save.isPending}
          error={error}
          onClose={close}
          onSave={(values) =>
            editing.id
              ? run(`/vault/${editing.kind}/${editing.id}`, 'PATCH', values, close)
              : run(`/vault/${editing.kind}`, 'POST', values, close)
          }
        />
      ) : null}
      {editing?.kind === 'achievement' ? (
        <AchievementModal
          initial={editingAchievement}
          saving={save.isPending}
          error={error}
          onClose={close}
          onSave={(text) =>
            editing.id
              ? run(`/vault/achievements/${editing.id}`, 'PATCH', { text }, close)
              : run('/vault/achievements', 'POST', { ...editing.parent, text }, close)
          }
        />
      ) : null}
      {editingProfile ? (
        <ProfileModal
          profile={vault.profile}
          saving={save.isPending}
          error={error}
          onClose={() => {
            setEditingProfile(false);
            setError(null);
          }}
          onSave={(values) =>
            run('/vault/profile', 'PATCH', values, () => setEditingProfile(false))
          }
        />
      ) : null}
      <Modal
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete this ${confirmDelete?.label ?? 'item'}?`}
        description="This removes it from your vault. Resumes you already exported are not affected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={save.isPending}
              onClick={() =>
                confirmDelete &&
                run(confirmDelete.path, 'DELETE', undefined, () => setConfirmDelete(null))
              }
            >
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
