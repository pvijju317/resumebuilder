import type { Me } from '@tailor/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, refreshSession, session } from './api.js';

type Status = 'loading' | 'authed' | 'anon';
interface AuthCtx {
  status: Status;
  signIn: (accessToken: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(() => (session.get() ? 'authed' : 'loading'));

  useEffect(() => {
    const unsub = session.subscribe((t) => setStatus(t ? 'authed' : 'anon'));
    // Restore a session from the refresh cookie on first load.
    if (!session.get()) void refreshSession();
    return unsub;
  }, []);

  const signIn = useCallback((token: string) => session.set(token), []);
  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    session.set(null);
    qc.clear();
  }, [qc]);

  return <Ctx.Provider value={{ status, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export function useMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: status === 'authed',
  });
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return null;
  if (status === 'anon')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
