'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { cx } from '@/components/ui';

/**
 * Before/after card of the results rail (owner 2026-11-24): the "after" photo is the front and
 * always shown first; tapping (or Enter/Space) turns the card around to the "before" photo and
 * back. Only rendered when the CMS item has a before photo. `prefers-reduced-motion` swaps
 * without the 3D turn (CSS).
 */
export function FlipCard({
  front,
  back,
  who,
  className,
}: {
  front: ReactNode;
  back: ReactNode;
  who: string;
  className?: string;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      className={cx('r-flip', className)}
      data-flipped={flipped ? '' : undefined}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${who}: Vorher-Bild, tippen für Nachher`
          : `${who}: Nachher-Bild, tippen für Vorher`
      }
      onClick={() => setFlipped((f) => !f)}
    >
      <span className="r-flip__inner">
        <span className="r-flip__face r-flip__face--front" aria-hidden={flipped}>
          {front}
          <span className="r-flip__tag">Nachher</span>
        </span>
        <span className="r-flip__face r-flip__face--back" aria-hidden={!flipped}>
          {back}
          <span className="r-flip__tag r-flip__tag--before">Vorher</span>
        </span>
      </span>
      <span aria-hidden className="r-flip__hint">
        {flipped ? 'Nachher ansehen' : 'Vorher ansehen'}
      </span>
    </button>
  );
}
