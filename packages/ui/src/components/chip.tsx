import { Check, CircleDashed, Minus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type ChipState = 'matched' | 'partial' | 'missing' | 'neutral';

const styles: Record<ChipState, string> = {
  matched: 'bg-success-soft text-success border-transparent',
  partial: 'bg-warning-soft text-warning border-transparent',
  missing: 'bg-surface text-muted border-dashed border-border-strong',
  neutral: 'bg-surface-muted text-text border-transparent',
};
const icons: Record<ChipState, ReactNode> = {
  matched: <Check aria-hidden />,
  partial: <CircleDashed aria-hidden />,
  missing: <X aria-hidden />,
  neutral: null,
};
const srState: Record<ChipState, string> = {
  matched: 'matched',
  partial: 'partially matched',
  missing: 'missing',
  neutral: '',
};

/** Keyword chip. State is conveyed by icon + text for screen readers, never by colour alone. */
export function Chip({
  state = 'neutral',
  children,
  onRemove,
  className,
}: {
  state?: ChipState;
  children: ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:stroke-[1.75]',
        styles[state],
        className,
      )}
    >
      {icons[state]}
      <span>{children}</span>
      {srState[state] ? <span className="sr-only">({srState[state]})</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 rounded-full p-0.5 hover:bg-text/10"
          aria-label={`Remove ${typeof children === 'string' ? children : 'item'}`}
        >
          <Minus aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
