import type { VaultDto } from '@tailor/shared';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Skeleton,
  StrengthMeter,
  useToast,
} from '@tailor/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useGapQuestions, useVault, vaultKeys } from './hooks.js';

/** Gap questions, one at a time (PRD F3). Answers become metrics on the achievement. */
export function StrengthenPage() {
  const vault = useVault();
  const gaps = useGapQuestions(!!vault.data);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [startStrength, setStartStrength] = useState<number | null>(null);

  const submit = useMutation({
    mutationFn: (
      body: { questionId: string; answer: string } | { questionId: string; skip: true },
    ) =>
      api<{ metricsAdded: number; vault: VaultDto }>('/vault/gap-answers', {
        method: 'POST',
        body: { answers: [body] },
      }),
    onMutate: () => setStartStrength((s) => s ?? vault.data?.strength ?? 0),
    onSuccess: (r) => {
      qc.setQueryData(vaultKeys.vault, r.vault);
      setAnswer('');
      setIndex((i) => i + 1);
    },
    onError: (e) =>
      toast({
        title: e instanceof ApiError ? e.message : 'Could not save that answer.',
        tone: 'error',
      }),
  });

  if (vault.isLoading || gaps.isLoading) return <Skeleton className="h-64" />;
  const questions = gaps.data ?? [];
  const q = questions[index];
  const strength = vault.data?.strength ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        to="/app/vault"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden /> Back to vault
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-text">Strengthen your vault</h2>
        <p className="text-sm text-muted">
          Numbers make achievements convincing. Answer what you know; skip the rest.
        </p>
      </div>
      <Card>
        <CardContent>
          <StrengthMeter
            value={strength}
            label={
              startStrength !== null && strength > startStrength
                ? `Vault strength, up from ${startStrength}%`
                : 'Vault strength'
            }
          />
        </CardContent>
      </Card>

      {!q ? (
        <EmptyState
          icon={<Sparkles />}
          title={questions.length ? 'All done for now' : 'No questions right now'}
          description="We ask again when you add new achievements."
          action={<Button onClick={() => navigate('/app/vault')}>Back to vault</Button>}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="tabular text-xs text-subtle">
              Question {index + 1} of {questions.length}
            </p>
            <blockquote className="border-l-2 border-border-strong pl-3 text-sm text-muted">
              {q.achievementText}
            </blockquote>
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) submit.mutate({ questionId: q.id, answer: answer.trim() });
              }}
            >
              <Field
                label={q.question}
                hint={
                  q.expectedUnit
                    ? `For example: 120 ${q.expectedUnit}`
                    : 'Include a number if you can.'
                }
              >
                <Input value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" loading={submit.isPending} disabled={!answer.trim()}>
                  Save answer
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate({ questionId: q.id, skip: true })}
                >
                  Skip
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
