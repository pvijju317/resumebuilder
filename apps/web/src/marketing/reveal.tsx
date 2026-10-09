import { cn } from '@tailor/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Show content immediately when motion is unwanted or the observer is unavailable. */
export const skipMotion = () =>
  typeof window === 'undefined' ||
  !('IntersectionObserver' in window) ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fades content in once when it enters the viewport (IntersectionObserver, no scroll listeners).
 * Motion purpose: pacing the story section by section. Disabled under prefers-reduced-motion.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(skipMotion);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shown) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,transform] duration-500 ease-[var(--ease-out)]',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** True once the element has been on screen (used to start the hero demo). */
export function useInView<T extends Element>(ref: React.RefObject<T | null>) {
  const [seen, setSeen] = useState(
    () => typeof window === 'undefined' || !('IntersectionObserver' in window),
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && (setSeen(true), io.disconnect()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}
