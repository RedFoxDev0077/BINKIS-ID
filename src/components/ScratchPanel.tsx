'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A scratchable foil panel.
 *
 * The claim moment is the product. On the physical piece the collector
 * scratches silver foil off a hologram, and this mirrors that gesture before
 * revealing the code input, so the digital act echoes the physical one
 * instead of jumping straight to a text field.
 *
 * It is deliberately not a gate. Scratching is a ritual, not a permission
 * check: the reveal is also available from a plain button, because a canvas
 * drag is impossible with a keyboard, hostile with a screen reader, and
 * unreliable on a cheap phone in a shop. The security boundary is the Claim
 * Code, never the interaction.
 */
const REVEAL_AT = 0.42; // fraction scratched before it opens on its own

export function ScratchPanel({
  hint,
  skipLabel,
  onRevealed,
  children,
}: {
  hint: string;
  skipLabel: string;
  onRevealed?: () => void;
  children: React.ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false);
  const revealedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [supportsCanvas, setSupportsCanvas] = useState(true);

  const reveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    onRevealed?.();
  }, [onRevealed]);

  // Paint the foil.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setSupportsCanvas(false);
      return;
    }

    const paint = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Brushed metallic foil, banded so the scratch marks read clearly.
      const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      grad.addColorStop(0, '#8e97a8');
      grad.addColorStop(0.25, '#d7dde8');
      grad.addColorStop(0.45, '#9aa3b4');
      grad.addColorStop(0.7, '#e6ebf3');
      grad.addColorStop(1, '#7d8697');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      for (let x = -rect.height; x < rect.width; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + rect.height, rect.height);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'destination-out';
    };

    paint();
    const observer = new ResizeObserver(() => {
      if (!revealedRef.current) paint();
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const scratchAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (!ctx) return;

    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 22, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    // Sample rather than read every pixel: this runs on pointerup on a phone.
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 24) {
      total++;
      if (data[i]! < 12) clear++;
    }
    if (total > 0 && clear / total >= REVEAL_AT) reveal();
  }, [reveal]);

  if (revealed || !supportsCanvas) {
    return <div className="animate-[rise_0.5s_cubic-bezier(0.22,1,0.36,1)]">{children}</div>;
  }

  return (
    <div className="space-y-3">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl border border-ink-700"
        style={{ touchAction: 'none' }}
      >
        <div className="pointer-events-none select-none opacity-60" aria-hidden>
          {children}
        </div>

        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scratchAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            scratchAt(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            drawing.current = false;
            measure();
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />

        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-ink-950/45 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 backdrop-blur-sm">
            {hint}
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={reveal}
        className="w-full text-center text-xs text-ink-500 underline underline-offset-4 transition hover:text-ink-300"
      >
        {skipLabel}
      </button>
    </div>
  );
}
