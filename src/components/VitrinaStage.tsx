'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { NICHES, STAGE, type Box, type Niche } from '@/lib/characters/vitrina';

/**
 * The case, and the one thing about it that needs a browser: a niche
 * switching on.
 *
 * The server already knows what is lit, so this adds nothing to the picture.
 * What it adds is the moment. A collector who registers a figure and then
 * opens their collection should watch that niche wake up, and the way to know
 * which niche is new is to remember which ones were lit the last time they
 * looked.
 *
 * That memory is a line in this browser, not a row in the database. Being
 * shown an animation is not a fact about a piece, and the ledger only carries
 * facts about pieces. The cost of getting it wrong is a light switching on
 * twice, or not switching on when they open their collection on a second
 * phone, and neither is worth a row that would outlive the collection.
 *
 * The reveal itself is the animator's, ported from their `repisa.js` onto the
 * markup the server renders: the spot comes on, the silhouette burns out, the
 * niche wakes, the plate lights and the figure drops into place.
 */

const SEEN_KEY = 'binkis:vitrina:lit';
const REVEAL_MS = 1700;

export function VitrinaStage({
  owned,
  label,
  children,
}: {
  owned: string[];
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Null until the comparison has been made. Deciding once matters: this
  // effect runs twice in development, and a second pass would read back the
  // record the first pass had just written and conclude nothing was new.
  const fresh = useRef<string[] | null>(null);

  const slotFor = (root: HTMLElement, code: string) => {
    const niche = NICHES.find((n) => n.characterCode === code);
    if (!niche) return null;
    const slot = root.querySelector<HTMLElement>(`[data-key="${niche.key}"]`);
    return slot ? { niche, slot } : null;
  };

  // Before the browser paints, so a niche that is about to light up is never
  // seen already lit. useEffect would run after the frame and the animation
  // would start from the finished state.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    if (fresh.current === null) {
      const codes = new Set(owned);
      let before: Set<string>;
      try {
        const raw = window.localStorage.getItem(SEEN_KEY);
        // No record at all means this browser has never shown the case. Light
        // it as it stands rather than running eight reveals at once.
        before = raw ? new Set(JSON.parse(raw) as string[]) : codes;
      } catch {
        before = codes;
      }
      fresh.current = [...codes].filter((code) => !before.has(code));

      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify([...codes]));
      } catch {
        // Private window or blocked storage: the case still renders, it just
        // cannot remember, so nothing animates. Better than not rendering.
      }
    }

    for (const code of fresh.current) {
      const found = slotFor(root, code);
      if (found) found.slot.dataset.owned = '0';
    }
  }, [owned]);

  useEffect(() => {
    const root = ref.current;
    const added = fresh.current;
    if (!root || !added || added.length === 0) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const running: Animation[] = [];

    added.forEach((code, index) => {
      const found = slotFor(root, code);
      if (!found) return;
      // Several at once would be a light show rather than a moment. They
      // follow one another, close enough to read as one event.
      running.push(...reveal(found.slot, found.niche, reduced, index * 420));
    });

    return () => {
      for (const animation of running) animation.cancel();
      root.querySelectorAll('.vt-fx').forEach((node) => node.remove());
      // Whatever happened to the animation, these niches are owned. Leaving
      // one dark because an effect was torn down halfway would be a figure
      // the collector holds and the case denies.
      for (const code of added) {
        const found = slotFor(root, code);
        if (found) found.slot.dataset.owned = '1';
      }
    };
  }, []);

  return (
    <div ref={ref} className="vitrina" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * One niche waking up, about 1.7 s:
 *
 *   0.00  the silhouette catches the light
 *   0.15  the showcase spot comes on, a cone of warm light
 *   0.35  the niche wakes and the plate lights
 *   0.50  the figure arrives: rises, overshoots, settles, with a halo in its
 *         own colour behind it and a burst of gold dust
 */
function reveal(slot: HTMLElement, niche: Niche, reduced: boolean, delay: number): Animation[] {
  const layer = (cls: string) => slot.querySelector<HTMLElement>(`.${cls}`);
  const silueta = layer('vt-silueta');
  const espacio = layer('vt-espacio');
  const placa = layer('vt-placa');
  const pieza = layer('vt-pieza');

  if (reduced) {
    // The state change still happens, it just does not perform.
    const out: Animation[] = [];
    slot.dataset.owned = '1';
    for (const el of [espacio, placa, pieza]) {
      if (el) out.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { delay, duration: 300 }));
    }
    if (silueta) out.push(silueta.animate([{ opacity: 1 }, { opacity: 0 }], { delay, duration: 300 }));
    return out;
  }

  const fx = (cls: string, box: Box) => {
    const node = document.createElement('div');
    node.className = `vt-fx ${cls}`;
    node.setAttribute('style', style(box));
    slot.append(node);
    return node;
  };

  const e = niche.espacio;
  const f = niche.pieza;
  const beam = fx('vt-beam', { x: e.x + e.w * 0.08, y: e.y, w: e.w * 0.84, h: e.h * 0.94 });
  const size = Math.max(f.w, f.h) * 1.15;
  const halo = fx('vt-halo', {
    x: f.x + f.w / 2 - size / 2,
    y: f.y + f.h * 0.48 - size / 2,
    w: size,
    h: size,
  });

  const T = REVEAL_MS;
  const at = (ms: number) => ms / T;
  const animations: Animation[] = [];

  if (silueta) {
    animations.push(
      silueta.animate(
        [
          { opacity: 1, filter: 'brightness(1)' },
          { opacity: 1, filter: 'brightness(2.6)', offset: at(300) },
          { opacity: 0, filter: 'brightness(3)', offset: at(700) },
          { opacity: 0 },
        ],
        { delay, duration: T, fill: 'both' },
      ),
    );
  }

  animations.push(
    beam.animate(
      [
        { opacity: 0, transform: 'scaleY(0)' },
        { opacity: 0.95, transform: 'scaleY(1)', offset: at(450) },
        { opacity: 0.6, transform: 'scaleY(1)', offset: at(800) },
        { opacity: 0, transform: 'scaleY(1)' },
      ],
      { delay: delay + 150, duration: T - 150, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' },
    ),
  );

  if (espacio) {
    animations.push(
      espacio.animate(
        [
          { opacity: 0, filter: 'brightness(2.2) saturate(0.6)' },
          { opacity: 1, filter: 'brightness(1.8) saturate(0.8)', offset: at(300) },
          { opacity: 1, filter: 'brightness(1) saturate(1)' },
        ],
        { delay: delay + 350, duration: T - 350, easing: 'ease-out', fill: 'backwards' },
      ),
    );
  }

  if (placa) {
    animations.push(
      placa.animate(
        [
          { opacity: 0, filter: 'brightness(1)' },
          { opacity: 1, filter: 'brightness(2.4)', offset: 0.25 },
          { opacity: 1, filter: 'brightness(1)' },
        ],
        { delay: delay + 450, duration: 900, easing: 'ease-out', fill: 'backwards' },
      ),
    );
  }

  animations.push(
    halo.animate(
      [
        { opacity: 0, transform: 'scale(0.4)' },
        { opacity: 0.6, transform: 'scale(1)', offset: 0.35 },
        { opacity: 0, transform: 'scale(1.25)' },
      ],
      { delay: delay + 450, duration: 1000, easing: 'ease-out', fill: 'forwards' },
    ),
  );

  if (pieza) {
    animations.push(
      pieza.animate(
        [
          { opacity: 0, transform: 'translateY(7%) scale(0.86)', filter: 'brightness(3) blur(6px)' },
          {
            opacity: 1,
            transform: 'translateY(-2%) scale(1.04)',
            filter: 'brightness(1.6) blur(0)',
            offset: 0.45,
          },
          {
            opacity: 1,
            transform: 'translateY(0.6%) scale(0.985)',
            filter: 'brightness(1.1) blur(0)',
            offset: 0.7,
          },
          { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'brightness(1) blur(0)' },
        ],
        { delay: delay + 500, duration: 1100, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' },
      ),
    );
  }

  // Gold dust. The directions are seeded from the character's own key, so a
  // niche throws the same sparks every time and the page spends no randomness.
  const random = mulberry32(niche.key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h * 0.5;
  for (let i = 0; i < 11; i++) {
    const spark = fx('vt-spark', { x: cx, y: cy, w: 0, h: 0 });
    spark.style.width = '';
    spark.style.height = '';

    const angle = random() * Math.PI * 2;
    const distance = (0.45 + random() * 0.55) * f.w * 0.9;
    const dx = (Math.cos(angle) * distance * 100) / STAGE.w;
    const dy = (Math.sin(angle) * distance * 100) / STAGE.w - 4;
    const scale = 0.5 + random() * 0.9;
    const tint = i % 3 === 0 ? niche.color : i % 3 === 1 ? '#ffe2b8' : '#fff4dc';
    spark.style.background = `radial-gradient(closest-side, #fff 0%, ${tint} 35%, transparent 100%)`;

    animations.push(
      spark.animate(
        [
          { opacity: 0, transform: `translate(0,0) scale(${scale * 0.3}) rotate(0deg)` },
          {
            opacity: 1,
            transform: `translate(${dx * 0.35}cqw,${dy * 0.35}cqw) scale(${scale}) rotate(40deg)`,
            offset: 0.25,
          },
          {
            opacity: 0,
            transform: `translate(${dx}cqw,${dy + 3}cqw) scale(${scale * 0.4}) rotate(120deg)`,
          },
        ],
        {
          delay: delay + 600 + random() * 180,
          duration: 800 + random() * 400,
          easing: 'cubic-bezier(.15,.7,.3,1)',
          fill: 'both',
        },
      ),
    );
  }

  // Marked owned now rather than when the animation ends: every layer above
  // fills backwards through its delay, so each one holds its opening frame
  // until its moment comes.
  slot.dataset.owned = '1';

  // The effects are scaffolding for the moment, not part of the case. Once
  // the last one finishes they come back out of the DOM.
  Promise.all(animations.map((a) => a.finished.catch(() => {}))).then(() => {
    slot.querySelectorAll('.vt-fx').forEach((node) => node.remove());
  });

  return animations;
}

function style(box: Box): string {
  return (
    `left:${(box.x / STAGE.w) * 100}%;top:${(box.y / STAGE.h) * 100}%;` +
    `width:${(box.w / STAGE.w) * 100}%;height:${(box.h / STAGE.h) * 100}%`
  );
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
