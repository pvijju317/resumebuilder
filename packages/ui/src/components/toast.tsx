import * as ToastPrimitive from '@radix-ui/react-toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

type Tone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}
interface ToastApi {
  toast: (t: Omit<ToastItem, 'id' | 'tone'> & { tone?: Tone }) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const toneIcon: Record<Tone, ReactNode> = {
  info: <Info className="text-accent-text" aria-hidden />,
  success: <CircleCheck className="text-success" aria-hidden />,
  error: <CircleAlert className="text-danger" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback<ToastApi['toast']>((t) => {
    setItems((xs) => [...xs, { id: Date.now() + Math.random(), tone: 'info', ...t }]);
  }, []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            type={t.tone === 'error' ? 'foreground' : 'background'}
            onOpenChange={(open) => !open && setItems((xs) => xs.filter((x) => x.id !== t.id))}
            className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-overlay data-[state=open]:animate-[toast-in_200ms_var(--ease-out)] data-[swipe=end]:animate-[fade-out_150ms_ease-out] [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:stroke-[1.5]"
          >
            {toneIcon[t.tone]}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <ToastPrimitive.Title className="text-sm font-medium text-text">
                {t.title}
              </ToastPrimitive.Title>
              {t.description ? (
                <ToastPrimitive.Description className="text-sm text-muted">
                  {t.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="rounded p-0.5 text-subtle hover:text-text [&_svg]:size-4 [&_svg]:stroke-[1.5]"
            >
              <X />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          className={cn(
            // Top right, under the top bar: never covers sticky page actions at the bottom.
            'fixed top-14 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none',
          )}
        />
      </ToastPrimitive.Provider>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
