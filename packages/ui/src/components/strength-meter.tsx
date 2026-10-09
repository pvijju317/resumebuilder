import { cn } from '../lib/cn.js';

/** Vault strength (0–100) as a segmented meter with a numeric label. */
export function StrengthMeter({
  value,
  label = 'Vault strength',
  segments = 10,
  className,
}: {
  value: number;
  label?: string;
  segments?: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const filled = Math.round((v / 100) * segments);
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="tabular text-sm text-muted">{v}%</span>
      </div>
      <div
        className="flex gap-1"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-200 ease-out',
              i < filled ? 'bg-accent' : 'bg-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}
