import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/cn.js';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function scoreTone(score: number): 'danger' | 'warning' | 'success' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

const toneColor = {
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  success: 'var(--success)',
} as const;

/** ATS score ring (0–100) with optional before → after delta. */
export function ScoreRing({
  score,
  before,
  size = 120,
  label = 'ATS score',
  className,
}: {
  score: number;
  before?: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const value = clamp(score);
  const stroke = Math.max(6, Math.round(size / 14));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const delta = before === undefined ? null : value - clamp(before);
  const tone = scoreTone(value);
  const description =
    delta === null
      ? `${label} ${value} out of 100`
      : `${label} ${value} out of 100, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} from ${clamp(before!)}`;

  return (
    <div
      className={cn('inline-flex flex-col items-center gap-2', className)}
      role="img"
      aria-label={description}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          {before !== undefined && delta !== null && delta > 0 ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={stroke}
              strokeDasharray={`${(clamp(before) / 100) * c} ${c}`}
              strokeLinecap="round"
            />
          ) : null}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneColor[tone]}
            strokeWidth={stroke}
            strokeDasharray={`${(value / 100) * c} ${c}`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-200 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <span
            className="tabular font-semibold tracking-tight text-text"
            style={{ fontSize: Math.round(size / 3.4) }}
          >
            {value}
          </span>
          <span className="text-xs text-subtle">/ 100</span>
        </div>
      </div>
      {delta !== null ? (
        <span
          aria-hidden
          className={cn(
            'tabular inline-flex items-center gap-1 text-xs font-medium [&_svg]:size-3.5',
            delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted',
          )}
        >
          {delta > 0 ? <ArrowUpRight /> : delta < 0 ? <ArrowDownRight /> : null}
          {clamp(before!)} → {value}
        </span>
      ) : null}
    </div>
  );
}
