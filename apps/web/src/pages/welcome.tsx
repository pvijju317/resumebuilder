import type { ExperienceLevel, Me, Region } from '@tailor/shared';
import { Button, Card, CardContent, Chip, cn, Field, Input } from '@tailor/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const REGIONS: [Region, string, string][] = [
  ['IN', 'India', 'Resume, 1 to 2 pages'],
  ['US', 'United States', 'Resume, 1 page'],
  ['UK', 'United Kingdom', 'CV, 2 pages'],
  ['EU', 'Europe', 'CV, 2 pages'],
];
const LEVELS: [ExperienceLevel, string][] = [
  ['fresher', 'Student or fresher'],
  ['early', '1 to 3 years'],
  ['mid', '3 to 8 years'],
  ['senior', '8 to 15 years'],
  ['executive', '15+ years or leadership'],
];

/** PRD F2 onboarding: up to 3 screens, all skippable. */
export function WelcomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [region, setRegion] = useState<Region>('IN');
  const [roles, setRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState('');
  const [level, setLevel] = useState<ExperienceLevel | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Me>('/me', { method: 'PATCH', body: { ...body, onboarded: true } }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me);
      navigate('/app/vault', { replace: true });
    },
  });
  const finish = () =>
    save.mutate({
      regionDefault: region,
      targetRoles: roles,
      ...(level ? { experienceLevel: level } : {}),
    });
  const addRole = () => {
    const r = roleInput.trim();
    if (r && roles.length < 5 && !roles.includes(r)) setRoles([...roles, r]);
    setRoleInput('');
  };

  const option = (selected: boolean) =>
    cn(
      'flex flex-col items-start gap-0.5 rounded-[var(--radius-control)] border px-4 py-3 text-left transition-colors duration-150',
      selected
        ? 'border-accent bg-accent-soft'
        : 'border-border bg-surface hover:border-border-strong',
    );

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="tabular text-xs text-subtle">Step {step + 1} of 3</p>
        <h2 className="text-xl font-semibold tracking-tight text-text">
          {step === 0
            ? 'Where are you applying?'
            : step === 1
              ? 'What roles are you targeting?'
              : 'How much experience do you have?'}
        </h2>
        <p className="text-sm text-muted">
          This sets sensible defaults. You can change everything later.
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {step === 0 ? (
            <div role="radiogroup" aria-label="Country" className="grid gap-2 sm:grid-cols-2">
              {REGIONS.map(([id, name, hint]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={region === id}
                  onClick={() => setRegion(id)}
                  className={option(region === id)}
                >
                  <span className="text-sm font-medium text-text">{name}</span>
                  <span className="text-xs text-muted">{hint}</span>
                </button>
              ))}
            </div>
          ) : step === 1 ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                addRole();
              }}
            >
              <Field label="Target role" hint="Press Enter to add. Up to 5.">
                <Input
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  placeholder="e.g. Data Analyst"
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Chip key={r} onRemove={() => setRoles(roles.filter((x) => x !== r))}>
                    {r}
                  </Chip>
                ))}
              </div>
            </form>
          ) : (
            <div role="radiogroup" aria-label="Experience" className="flex flex-col gap-2">
              {LEVELS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={level === id}
                  onClick={() => setLevel(id)}
                  className={option(level === id)}
                >
                  <span className="text-sm font-medium text-text">{label}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => save.mutate({})} disabled={save.isPending}>
          Skip for now
        </Button>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)}>Continue</Button>
          ) : (
            <Button loading={save.isPending} onClick={finish}>
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
