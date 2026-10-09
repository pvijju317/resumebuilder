import { Spinner } from '@tailor/ui';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { refreshSession } from '../lib/api.js';

/** Landing page after Google OAuth: trade the refresh cookie for an access token. */
export function AuthCompletePage() {
  const navigate = useNavigate();
  useEffect(() => {
    void refreshSession().then((ok) =>
      navigate(ok ? '/' : '/login?error=google', { replace: true }),
    );
  }, [navigate]);
  return (
    <main className="flex min-h-dvh items-center justify-center text-muted">
      <Spinner label="Signing you in" />
    </main>
  );
}
