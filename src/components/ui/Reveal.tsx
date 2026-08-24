'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-triggered reveal.
 *
 * IntersectionObserver rather than a scroll listener: the browser does the
 * work off the main thread, and the element is unobserved once shown so a long
 * collection page does not keep dozens of observers alive.
 *
 * Falls back to visible if IntersectionObserver is missing, because content
 * that never appears is a far worse failure than content that appears without
 * animating.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.unobserve(entry.target);
          }
        }
      },
      // Fire slightly before the element reaches the viewport, so the motion
      // has finished by the time it is properly in view.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-shown={shown ? 'true' : 'false'}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}
