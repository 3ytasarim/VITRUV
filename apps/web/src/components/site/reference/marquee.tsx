import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Endless CSS marquee (no JS): the content runs twice in one track that moves by exactly one copy
 * (−50 %), so the loop is seamless. The copy is `aria-hidden` + `inert` — screen readers and the
 * keyboard meet every item once. Pauses on hover/focus; with `prefers-reduced-motion` it stands
 * still and shows the first copy as a normal list.
 */
export function Marquee({
  children,
  vertical = false,
  seconds = 40,
  className,
}: {
  children: ReactNode;
  /** Runs upwards instead of to the left. */
  vertical?: boolean;
  /** Duration of one full loop. */
  seconds?: number;
  className?: string;
}) {
  return (
    <div
      className={cx('r-marquee', vertical && 'r-marquee--v', className)}
      style={{ '--r-marquee-dur': `${seconds}s` } as CSSProperties}
    >
      <div className="r-marquee__track">
        <div className="r-marquee__group">{children}</div>
        <div className="r-marquee__group" aria-hidden inert>
          {children}
        </div>
      </div>
    </div>
  );
}
