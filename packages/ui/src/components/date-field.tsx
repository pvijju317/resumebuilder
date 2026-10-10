import { useId, useState } from 'react';
import { cn } from '../lib/cn.js';

const control =
  'h-10 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-sm text-text placeholder:text-subtle shadow-card transition-colors duration-150 ease-out hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-text focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Vault date: `YYYY-MM`, or `YYYY` when only the year is known (the month stays optional so we
 * never invent one). `null` means empty, or "present" when `presentLabel` is given.
 */
export function DateField({
  label,
  value,
  onChange,
  presentLabel,
  className,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  /** Shows a checkbox (e.g. "I work here now"); checked means `null` = present. */
  presentLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [year, setYear] = useState(value?.slice(0, 4) ?? '');
  const [month, setMonth] = useState(value?.slice(5, 7) ?? '');
  const [present, setPresent] = useState(!!presentLabel && !value);

  // Follow outside changes (e.g. a reset), but not our own partial typing.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value) {
      setYear(value.slice(0, 4));
      setMonth(value.slice(5, 7));
    }
  }

  const emit = (y: string, m: string) => {
    if (/^\d{4}$/.test(y)) onChange(m ? `${y}-${m}` : y);
    else if (y === '') onChange(null);
  };

  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-2 text-sm font-medium text-text">{label}</legend>
      <div className="flex gap-2">
        <select
          aria-label={`${label} month (optional)`}
          className={cn(control, 'w-28 shrink-0 pr-2')}
          value={month}
          disabled={present}
          onChange={(e) => {
            setMonth(e.target.value);
            emit(year, e.target.value);
          }}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, '0')}>
              {m}
            </option>
          ))}
        </select>
        <input
          id={id}
          aria-label={`${label} year`}
          className={cn(control, 'tabular w-full min-w-0')}
          inputMode="numeric"
          placeholder="Year"
          maxLength={4}
          value={year}
          disabled={present}
          onChange={(e) => {
            const y = e.target.value.replace(/\D/g, '').slice(0, 4);
            setYear(y);
            emit(y, month);
          }}
        />
      </div>
      {presentLabel ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={present}
            onChange={(e) => {
              setPresent(e.target.checked);
              if (e.target.checked) onChange(null);
              else emit(year, month);
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          {presentLabel}
        </label>
      ) : null}
    </fieldset>
  );
}
