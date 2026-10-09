import type { AuthTokens } from '@tailor/shared';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type Listener = (token: string | null) => void;
let accessToken: string | null = null;
const listeners = new Set<Listener>();

export const session = {
  get: () => accessToken,
  set(token: string | null) {
    accessToken = token;
    listeners.forEach((l) => l(token));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

let refreshing: Promise<boolean> | null = null;

/** Exchange the httpOnly refresh cookie for an access token. Concurrent callers share one call. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) {
        session.set(null);
        return false;
      }
      const body = (await res.json()) as AuthTokens;
      session.set(body.accessToken);
      return true;
    })
    .catch(() => {
      session.set(null);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers['authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (res.status === 401 && init.retry !== false && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, { ...init, retry: false });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code: string; message: string };
    } | null;
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL',
      body?.error?.message ?? 'Something went wrong. Please try again.',
      res.status,
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
