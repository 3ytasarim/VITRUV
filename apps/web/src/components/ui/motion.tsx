import type { ElementType, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Scroll-driven entrance (fade + short rise) using CSS scroll timelines — no JavaScript.
 * Content is never hidden: without browser support or with reduced motion it simply appears.
 */
export function Reveal({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx('vt-reveal', className)}>{children}</Tag>;
}

/**
 * Branded glitch accent for SHORT display text (headlines, a CTA word) — never body copy.
 * A chromatic text-shadow pulse plays once on first paint and again on hover/focus; the glyphs
 * never move, so the text stays readable. Off under prefers-reduced-motion.
 */
export function GlitchText({ className, children }: { className?: string; children: string }) {
  return <span className={cx('vt-glitch', className)}>{children}</span>;
}
