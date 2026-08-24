'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up when it first becomes visible.
 *
 * Used only for collection stats, where the count is the point. Deliberately
 * not used for a serial or an edition position: those are identity, and a
 * number that animates through wrong values before settling on the right one
 * is actively misleading on a page whose whole purpose is authenticity.
 */
export function CountUp({
  value,
  duration = 900,
  className = '',
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      setDisplay(value);
      return;
    }

    setDisplay(0);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || started.current) continue;
          started.current = true;
          observer.unobserve(entry.target);

          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // Ease-out cubic, so it decelerates into the final number.
            const eased = 1 - (1 - t) ** 3;
            setDisplay(Math.round(eased * value));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
