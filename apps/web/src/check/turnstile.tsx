import type { PublicConfig } from '@tailor/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

declare global {
  interface Window {
    turnstile?: {
      render(
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (t: string) => void;
          'expired-callback': () => void;
          theme?: string;
          size?: string;
        },
      ): string;
      reset(id: string): void;
      remove(id: string): void;
    };
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function loadScript() {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile failed to load'));
    document.head.appendChild(s);
  });
  return loading;
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<PublicConfig>('/config'),
    staleTime: Infinity,
  });
}

/** The server's upload limit, e.g. "4 MB" (null until the config has loaded). */
export function useUploadLimit(): { bytes: number; label: string } | null {
  const bytes = usePublicConfig().data?.maxUploadBytes;
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return { bytes, label: `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB` };
}

/**
 * Cloudflare Turnstile widget. Calls onToken with a single-use token; `resetKey` changes force a
 * fresh token after each submit. Without a site key (local dev) it issues a placeholder token.
 */
export function Turnstile({
  onToken,
  resetKey,
}: {
  onToken: (t: string | null) => void;
  resetKey: number;
}) {
  const config = usePublicConfig();
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const siteKey = config.data?.turnstileSiteKey ?? null;

  useEffect(() => {
    if (config.isLoading) return;
    if (!siteKey) {
      onToken('dev-no-turnstile');
      return;
    }
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !el.current || !window.turnstile) return;
        if (widget.current) window.turnstile.reset(widget.current);
        else
          widget.current = window.turnstile.render(el.current, {
            sitekey: siteKey,
            size: 'flexible',
            theme: 'auto',
            callback: (t) => onToken(t),
            'expired-callback': () => onToken(null),
          });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
    };
  }, [siteKey, config.isLoading, resetKey, onToken]);

  useEffect(
    () => () => {
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );

  return siteKey ? <div ref={el} className="min-h-[65px]" /> : null;
}
