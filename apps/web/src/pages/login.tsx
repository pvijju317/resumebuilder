import { Button, Card, CardContent, Field, Input } from '@tailor/ui';
import type { AuthTokens } from '@tailor/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { HeroDemo } from '../marketing/hero-demo.js';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { Wordmark } from '../layout/wordmark.js';

const RESEND_SECONDS = 30;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
      />
    </svg>
  );
}

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const signup = params.get('mode') === 'signup';
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'google'
      ? 'Google sign-in did not complete. Try again or use email.'
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: () => api<{ email: boolean; google: boolean }>('/auth/providers'),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (status === 'authed') {
    const from = (location.state as { from?: string } | null)?.from ?? '/app';
    return <Navigate to={from} replace />;
  }

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/auth/otp/request', { method: 'POST', body: { email } });
      setStep('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send the code. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const tokens = await api<AuthTokens>('/auth/otp/verify', {
        method: 'POST',
        body: { email, code },
      });
      signIn(tokens.accessToken);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not verify the code. Please try again.',
      );
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-6 md:px-10">
        <Link to="/" className="self-start" aria-label="Tailor home">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-12">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-text">
              {step === 'code'
                ? 'Check your email'
                : signup
                  ? 'Create your account'
                  : 'Welcome back'}
            </h1>
            <p className="text-sm text-muted">
              {step === 'email' ? (
                signup ? (
                  'Free to start. We’ll email you a 6-digit code. No password needed.'
                ) : (
                  'We’ll email you a 6-digit code. No password needed.'
                )
              ) : (
                <>
                  We sent a code to <span className="font-medium text-text">{email}</span>.
                </>
              )}
            </p>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-4">
              {step === 'email' ? (
                <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
                  <Field label="Email" error={error ?? undefined}>
                    <Input
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </Field>
                  <Button type="submit" loading={busy} disabled={!email.includes('@')}>
                    Continue with email
                  </Button>
                </form>
              ) : (
                <form onSubmit={verify} className="flex flex-col gap-4" noValidate>
                  <Field label="Sign-in code" error={error ?? undefined}>
                    <Input
                      name="code"
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      placeholder="123456"
                      className="tabular text-center text-base tracking-[0.4em]"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoFocus
                    />
                  </Field>
                  <Button type="submit" loading={busy} disabled={code.length !== 6}>
                    Verify and sign in
                  </Button>
                  <div className="flex items-center justify-between">
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setStep('email');
                        setError(null);
                      }}
                    >
                      <ArrowLeft /> Different email
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      disabled={cooldown > 0 || busy}
                      onClick={() => void requestCode()}
                    >
                      {cooldown > 0 ? (
                        <span className="tabular">Resend in {cooldown}s</span>
                      ) : (
                        'Resend code'
                      )}
                    </Button>
                  </div>
                </form>
              )}

              {step === 'email' && providers.data?.google ? (
                <>
                  <div className="flex items-center gap-3 text-xs text-subtle" aria-hidden>
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button variant="secondary" asChild>
                    <a href="/api/v1/auth/google/start">
                      <GoogleMark /> Continue with Google
                    </a>
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>

          <p className="text-xs text-subtle">
            {signup ? 'Already have an account? ' : 'New to Tailor? '}
            <Link
              to={signup ? '/login' : '/login?mode=signup'}
              className="font-medium text-accent-text underline-offset-4 hover:underline"
            >
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <p className="text-xs text-subtle">
            By continuing you agree to the{' '}
            <Link to="/legal/terms" className="underline underline-offset-2">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            . You review AI-processing consent before any upload.
          </p>
        </div>
      </div>
      <aside
        className="hidden flex-col justify-center gap-8 border-l border-border bg-surface-muted px-10 py-12 lg:flex xl:px-16"
        aria-label="What Tailor does"
      >
        <div className="flex max-w-[44ch] flex-col gap-2">
          <p className="text-lg font-semibold tracking-tight text-text">
            The same experience, written for the job in front of you.
          </p>
          <p className="flex items-center gap-2 text-sm text-muted">
            <ShieldCheck aria-hidden className="size-4 text-accent-text" strokeWidth={1.5} /> Every
            fact checked against your vault.
          </p>
        </div>
        <div className="max-w-xl">
          <HeroDemo />
        </div>
      </aside>
    </main>
  );
}
