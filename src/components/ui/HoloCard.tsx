'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * A card with pointer-tracked holographic foil and a 3D tilt.
 *
 * The physical product is a hologram on a collectible, so iridescence is the
 * product's own material rather than an effect borrowed from somewhere. The
 * technique mirrors how real holofoil behaves: pointer position is normalised
 * and written into CSS custom properties, one layer paints a broad iridescent
 * wash under `color-dodge` for the bright flare, and a second paints fine
 * diagonal lines masked to fade away from the highlight. The card leans into
 * the pointer so the light appears to move across a surface rather than under
 * a flat image.
 *
 * Everything is driven by CSS custom properties, so a single style write per
 * pointer move updates all of it and the browser stays on the compositor.
 *
 * Touch devices get the foil without the tilt: on a phone the finger covers
 * the thing it is tilting, and a card that moves under your thumb reads as a
 * bug. `prefers-reduced-motion` disables the tilt entirely, in CSS.
 */
export function HoloCard({
  children,
  className = '',
  intensity = 9,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum tilt in degrees. */
  intensity?: number;
  as?: 'div' | 'article' | 'li';
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  const apply = useCallback(
    (clientX: number, clientY: number, tilt: boolean) => {
      const node = ref.current;
      if (!node) return;

      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = node.getBoundingClientRect();
        const px = (clientX - rect.left) / rect.width;
        const py = (clientY - rect.top) / rect.height;

        node.style.setProperty('--holo-x', `${(px * 100).toFixed(2)}%`);
        node.style.setProperty('--holo-y', `${(py * 100).toFixed(2)}%`);

        if (tilt) {
          // Normalised to -1..1, then scaled. Y drives rotateX inverted so the
          // card leans towards the pointer rather than away from it.
          node.style.setProperty('--tilt-y', `${((px - 0.5) * 2 * intensity).toFixed(2)}deg`);
          node.style.setProperty('--tilt-x', `${((0.5 - py) * 2 * intensity).toFixed(2)}deg`);
        }
      });
    },
    [intensity],
  );

  const reset = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--tilt-x', '0deg');
    node.style.setProperty('--tilt-y', '0deg');
    node.style.setProperty('--holo-x', '50%');
    node.style.setProperty('--holo-y', '50%');
    setActive(false);
  }, []);

  return (
    <div className="tilt-scene">
      <Tag
        ref={ref as never}
        data-active={active ? 'true' : 'false'}
        className={`tilt-card holo-foil relative isolate overflow-hidden ${className}`}
        onPointerMove={(e: React.PointerEvent) => {
          setActive(true);
          apply(e.clientX, e.clientY, e.pointerType === 'mouse');
        }}
        onPointerLeave={reset}
        onPointerCancel={reset}
      >
        {children}
      </Tag>
    </div>
  );
}
