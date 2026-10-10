import type { VaultImportDto } from '@tailor/shared';
import {
  Button,
  Card,
  CardContent,
  cn,
  Field,
  ProgressSteps,
  Textarea,
  useToast,
} from '@tailor/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, RotateCcw } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { api, ApiError } from '../lib/api.js';
import { useUploadLimit } from '../check/turnstile.js';
import { uploadResume, vaultKeys } from './hooks.js';

const ACCEPT =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

export function BuildPanel({ title = 'Build your Career Vault' }: { title?: string }) {
  const limit = useUploadLimit();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [text, setText] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const build = useMutation({
    mutationFn: async (src: { file: File } | { text: string }) => {
      const body = 'file' in src ? { fileId: await uploadResume(src.file) } : { text: src.text };
      return api<VaultImportDto>('/vault/build', { method: 'POST', body });
    },
    onSuccess: (imp) => {
      qc.setQueryData(vaultKeys.latestImport, imp);
      toast({ title: 'Reading your resume' });
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
      setError(msg);
      if (e instanceof ApiError && e.status === 503) setMode('paste');
    },
  });

  const pick = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!/\.(pdf|docx|txt)$/i.test(file.name)) return setError('Upload a PDF, DOCX or TXT file.');
    if (limit && file.size > limit.bytes)
      return setError(`Files must be ${limit.label} or smaller.`);
    build.mutate({ file });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-text">{title}</h2>
          <p className="text-sm text-muted">
            Start from the resume you already have. You will review everything before it is saved.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Resume source"
          className="flex w-fit rounded-[var(--radius-control)] bg-surface-muted p-0.5"
        >
          {(['file', 'paste'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                'h-8 rounded-[6px] px-3 text-sm transition-colors duration-150',
                mode === m
                  ? 'bg-surface font-medium text-text shadow-card'
                  : 'text-muted hover:text-text',
              )}
            >
              {m === 'file' ? 'Upload file' : 'Paste text'}
            </button>
          ))}
        </div>

        {mode === 'file' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center transition-colors duration-150',
              dragging ? 'border-accent bg-accent-soft' : 'border-border-strong',
            )}
          >
            <FileUp aria-hidden className="size-6 text-muted" strokeWidth={1.5} />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-text">Drop your resume here</p>
              <p className="text-xs text-subtle">
                PDF, DOCX or TXT{limit ? `, up to ${limit.label}` : ''}
              </p>
            </div>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="Choose resume file"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="secondary"
              loading={build.isPending}
              onClick={() => input.current?.click()}
            >
              Choose file
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              build.mutate({ text });
            }}
          >
            <Field
              label="Resume text"
              hint="Copy everything from your current resume, including dates."
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="Paste your resume"
              />
            </Field>
            <div>
              <Button type="submit" loading={build.isPending} disabled={text.trim().length < 200}>
                Build my vault
              </Button>
            </div>
          </form>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STEPS = [
  { id: 'upload', label: 'Uploaded' },
  { id: 'read', label: 'Reading' },
  { id: 'structure', label: 'Structuring' },
  { id: 'review', label: 'Ready to review' },
];

export function ImportProgress({ imp }: { imp: VaultImportDto }) {
  const qc = useQueryClient();
  if (imp.status === 'failed') {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-text">
            We could not read your resume
          </h2>
          <p className="text-sm text-muted">{imp.error ?? 'Please try again.'}</p>
          <Button variant="secondary" onClick={() => qc.setQueryData(vaultKeys.latestImport, null)}>
            <RotateCcw /> Try again
          </Button>
        </CardContent>
      </Card>
    );
  }
  const current = imp.status === 'queued' ? 'read' : 'structure';
  return (
    <Card>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-text">Building your vault</h2>
          <p className="text-sm text-muted">
            This usually takes under a minute. You can leave this page; we will keep working.
          </p>
        </div>
        <ProgressSteps steps={STEPS} current={current} />
      </CardContent>
    </Card>
  );
}
