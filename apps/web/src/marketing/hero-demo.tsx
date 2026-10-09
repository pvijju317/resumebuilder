import { Chip, cn, ScoreRing } from '@tailor/ui';
import { Fragment, useEffect, useRef, useState } from 'react';
import { EXAMPLE } from './example.js';
import { skipMotion, useInView } from './reveal.js';

type View = 'before' | 'after';

function Highlighted({ parts }: { parts: string[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('[') ? (
          <mark
            key={i}
            className="rounded-[3px] bg-accent-soft px-0.5 text-text [box-decoration-break:clone]"
          >
            {p.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Live product preview: the same example resume before and after tailoring. Plays the switch once
 * when it comes into view (the story of the product), then the visitor can toggle it.
 */
export function HeroDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  // Reduced motion: start on the tailored view instead of animating to it.
  const [view, setView] = useState<View>(() => (skipMotion() ? 'after' : 'before'));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!seen || touched) return;
    const t = setTimeout(() => setView('after'), 1400);
    return () => clearTimeout(t);
  }, [seen, touched]);

  const pick = (v: View) => {
    setTouched(true);
    setView(v);
  };
  const after = view === 'after';

  return (
    <div
      ref={ref}
      className="relative rounded-[var(--radius-card)] border border-border bg-surface shadow-raised"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text">{EXAMPLE.role}</p>
          <p className="truncate text-xs text-subtle">{EXAMPLE.context}</p>
        </div>
        <div
          role="tablist"
          aria-label="Resume version"
          className="flex shrink-0 rounded-[var(--radius-control)] bg-surface-muted p-0.5"
        >
          {(['before', 'after'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              onClick={() => pick(v)}
              className={cn(
                'h-7 rounded-[6px] px-3 text-xs font-medium transition-colors duration-150',
                view === v ? 'bg-surface text-text shadow-card' : 'text-muted hover:text-text',
              )}
            >
              {v === 'before' ? 'Your resume' : 'Tailored'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr]">
        <div className="flex justify-center sm:block">
          <ScoreRing
            score={after ? EXAMPLE.score.after : EXAMPLE.score.before}
            before={after ? EXAMPLE.score.before : undefined}
            size={112}
            label="Example ATS score"
          />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-subtle">Must-have keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE.keywords.map((k) => (
              <Chip key={k.name} state={after ? k.after : k.before}>
                {k.name}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      <ul
        className="flex list-disc flex-col gap-3 border-t border-border py-4 pr-5 pl-9 text-sm leading-relaxed text-text marker:text-border-strong"
        aria-live="polite"
      >
        {EXAMPLE.bullets.map((b, i) => (
          <li key={i}>
            <span
              className={cn(
                'transition-opacity duration-200',
                after ? 'opacity-100' : 'text-muted',
              )}
            >
              {after ? <Highlighted parts={b.after} /> : b.before}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-5 py-3 text-xs text-subtle">
        Example from a sample vault. Every number in the tailored version comes from that vault.
      </p>
    </div>
  );
}
