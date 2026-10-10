import type { AnonCheckDto, UploadUrlResponse } from '@tailor/shared';
import { Button, cn, Field, Input, Textarea } from '@tailor/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, FileUp, ShieldCheck } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { Turnstile, useUploadLimit } from './turnstile.js';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-fit rounded-[var(--radius-control)] bg-surface-muted p-0.5"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'h-8 rounded-[6px] px-3 text-sm transition-colors duration-150',
            value === v
              ? 'bg-surface font-medium text-text shadow-card'
              : 'text-muted hover:text-text',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** PRD F1: resume + job in, ATS score out, no account. */
export function CheckForm() {
  const limit = useUploadLimit();
  const navigate = useNavigate();
  const [resumeMode, setResumeMode] = useState<'file' | 'paste'>('file');
  const [jobMode, setJobMode] = useState<'paste' | 'url'>('paste');
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [jobText, setJobText] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const onToken = useCallback((t: string | null) => setToken(t), []);

  const check = useMutation({
    mutationFn: async () => {
      let resume: { text: string } | { fileId: string };
      if (resumeMode === 'file') {
        const ext = file!.name.split('.').pop()!.toLowerCase();
        const up = await api<UploadUrlResponse>('/anon/upload-url', {
          method: 'POST',
          body: { fileName: file!.name, mime: MIME[ext], size: file!.size },
        });
        const res = await fetch(up.url, { method: 'PUT', headers: up.headers, body: file });
        if (!res.ok)
          throw new ApiError(
            'UPLOAD_FAILED',
            'The upload did not go through. Please try again.',
            res.status,
          );
        resume = { fileId: up.fileId };
      } else resume = { text: resumeText };
      const job = jobMode === 'url' ? { url: jobUrl.trim() } : { text: jobText };
      return api<AnonCheckDto>('/anon/check', {
        method: 'POST',
        body: { resume, job, turnstileToken: token },
      });
    },
    onSuccess: (r) => navigate(`/check/${r.id}`),
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setResetKey((k) => k + 1); // Turnstile tokens are single-use
    },
  });

  const resumeReady = resumeMode === 'file' ? !!file : resumeText.trim().length >= 200;
  const jobReady =
    jobMode === 'url' ? /^https?:\/\/\S+\.\S+/.test(jobUrl.trim()) : jobText.trim().length >= 200;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        check.mutate();
      }}
      className="grid gap-6 rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-raised md:grid-cols-2 md:p-8"
      noValidate
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text">Your resume</h3>
          <Segmented
            label="Resume input"
            value={resumeMode}
            onChange={setResumeMode}
            options={[
              ['file', 'Upload'],
              ['paste', 'Paste'],
            ]}
          />
        </div>
        {resumeMode === 'file' ? (
          <div className="flex min-h-[184px] flex-col items-center justify-center gap-3 rounded-[var(--radius-control)] border border-dashed border-border-strong p-6 text-center">
            <FileUp aria-hidden className="size-5 text-muted" strokeWidth={1.5} />
            <p className="text-sm text-text">
              {file ? file.name : `PDF, DOCX or TXT${limit ? `, up to ${limit.label}` : ''}`}
            </p>
            <input
              ref={input}
              type="file"
              accept=".pdf,.docx,.txt"
              className="sr-only"
              aria-label="Choose resume file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setError(null);
                if (f && (!/\.(pdf|docx|txt)$/i.test(f.name) || (limit && f.size > limit.bytes)))
                  return setError(
                    `Upload a PDF, DOCX or TXT file${limit ? ` up to ${limit.label}` : ''}.`,
                  );
                setFile(f);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => input.current?.click()}
            >
              {file ? 'Choose another' : 'Choose file'}
            </Button>
          </div>
        ) : (
          <Field label="Resume text">
            <Textarea
              rows={7}
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your full resume"
            />
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text">The job</h3>
          <Segmented
            label="Job input"
            value={jobMode}
            onChange={setJobMode}
            options={[
              ['paste', 'Paste'],
              ['url', 'Link'],
            ]}
          />
        </div>
        {jobMode === 'paste' ? (
          <Field label="Job description">
            <Textarea
              rows={7}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Paste the full job description"
            />
          </Field>
        ) : (
          <div className="flex min-h-[184px] flex-col justify-center gap-2">
            <Field
              label="Job link"
              hint="Some sites block automated reading. If it fails, paste the description."
            >
              <Input
                type="url"
                inputMode="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 md:col-span-2 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <Turnstile onToken={onToken} resetKey={resetKey} />
          <p className="flex items-center gap-2 text-xs text-subtle">
            <ShieldCheck aria-hidden className="size-4 text-accent-text" strokeWidth={1.5} />
            No account needed. Your check is deleted after 72 hours.
          </p>
        </div>
        <Button
          type="submit"
          size="lg"
          loading={check.isPending}
          disabled={!resumeReady || !jobReady || !token}
        >
          Check my ATS score <ArrowRight />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger md:col-span-2">
          {error}
        </p>
      ) : null}
    </form>
  );
}
