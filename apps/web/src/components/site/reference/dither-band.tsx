'use client';

import { useRef, type PointerEvent } from 'react';

/**
 * Dot band of the dithered footer (port of the MIT "Dithered Footer" by @otatechie): a drifting
 * field of dithered dots in the site blue with the brand name cut out of it; the dots brighten in
 * a circle under the cursor (CSS mask follows --df-x / --df-y). Pure CSS masks, no images;
 * decorative (aria-hidden). Drift and rise animations are off with prefers-reduced-motion.
 */
export function DitherBand({ word }: { word: string }) {
  const field = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = field.current;
    if (!el || e.pointerType === 'touch') return;
    const box = el.getBoundingClientRect();
    el.style.setProperty('--df-x', `${e.clientX - box.left}px`);
    el.style.setProperty('--df-y', `${e.clientY - box.top}px`);
    el.classList.add('df-lit');
  };
  const leave = () => field.current?.classList.remove('df-lit');
  return (
    <div aria-hidden className="df-band" onPointerMove={move} onPointerLeave={leave}>
      <div ref={field} className="df-field">
        <div className="df-dots" />
      </div>
      <p className="df-mark">{word}</p>
    </div>
  );
}
