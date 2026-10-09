import { Check } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Spinner } from './spinner.js';

export interface Step {
  id: string;
  label: string;
}

/**
 * Multi-step progress for long operations (never a bare spinner for > 2 s).
 * Default optimizer steps: Selecting → Rewriting → Checking facts → Scoring.
 */
export function ProgressSteps({
  steps,
  current,
  orientation = 'horizontal',
  className,
}: {
  steps: Step[];
  /** Horizontal from `sm` up (default) or always vertical. */
  orientation?: 'horizontal' | 'vertical';
  /** id of the active step; `null` before start; `'done'` when finished. */
  current: string | null;
  className?: string;
}) {
  const activeIndex = current === 'done' ? steps.length : steps.findIndex((s) => s.id === current);
  const active = steps[activeIndex];
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ol
        className={cn(
          'flex flex-col gap-3',
          orientation === 'horizontal' && 'sm:flex-row sm:items-center sm:gap-2',
        )}
      >
        {steps.map((s, i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <li
              key={s.id}
              className={cn('flex items-center gap-2', orientation === 'horizontal' && 'sm:flex-1')}
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors duration-200 ease-out [&_svg]:size-3.5',
                  state === 'done' && 'border-transparent bg-accent text-accent-fg',
                  state === 'active' && 'border-accent-text text-accent-text',
                  state === 'pending' && 'border-border text-subtle',
                )}
                aria-hidden
              >
                {state === 'done' ? (
                  <Check strokeWidth={2} />
                ) : state === 'active' ? (
                  <Spinner className="size-3.5" label="" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  state === 'pending' ? 'text-subtle' : 'text-text',
                  state === 'active' && 'font-medium',
                )}
              >
                {s.label}
                <span className="sr-only">
                  {state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}
                </span>
              </span>
              {i < steps.length - 1 && orientation === 'horizontal' ? (
                <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {current === 'done' ? 'Finished' : active ? `${active.label}…` : ''}
      </p>
    </div>
  );
}

export const OPTIMIZE_STEPS: Step[] = [
  { id: 'selecting', label: 'Selecting' },
  { id: 'rewriting', label: 'Rewriting' },
  { id: 'checking', label: 'Checking facts' },
  { id: 'scoring', label: 'Scoring' },
];
