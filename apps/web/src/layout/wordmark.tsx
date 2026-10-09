export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path
          d="M10 11h12M16 11v11"
          stroke="var(--accent-fg)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-base font-semibold tracking-tight text-text">Tailor</span>
    </span>
  );
}
