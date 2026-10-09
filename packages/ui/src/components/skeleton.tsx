import { cn } from '../lib/cn.js';

export const Skeleton = ({ className }: { className?: string }) => (
  <div
    className={cn('animate-pulse rounded-[var(--radius-control)] bg-surface-muted', className)}
    aria-hidden
  />
);
