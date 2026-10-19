import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowUpRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { cx } from '@/components/ui';
import { HarmonyMotif } from '../harmony-motif';

/**
 * Colour-change card — behaviour of the 21st.dev "Color Change Card" (vaib215), re-built on
 * VITRUV tokens with CSS only (the original uses framer-motion; the registry needs a login, so the
 * pattern was re-implemented from its public preview):
 *   - the image rests in greyscale and turns to full colour on hover / keyboard focus;
 *   - the heading letters change colour one after another (staggered), the arrow turns;
 *   - a warm ink gradient keeps the white copy legible at all times.
 * The heading is set as real text; the per-letter spans are a visual layer only (aria-hidden),
 * with the full word in a visually hidden span for assistive technology. Reduced motion: colour
 * changes instantly, no stagger. Without an image the card shows a dark panel with the
 * Vitruvian geometry.
 */
export function ColorChangeCard({
  title,
  eyebrow,
  children,
  media,
  className,
}: {
  title: string;
  eyebrow?: ReactNode;
  children?: ReactNode;
  media?: ResolvedMediaSlot | null;
  className?: string;
}) {
  return (
    <article className={cx('vt-ccard vt-on-media', className)} tabIndex={0}>
      <div aria-hidden className="vt-ccard__media">
        {media ? (
          <CmsMedia slot={media} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
        ) : (
          <HarmonyMotif className="vt-ccard__motif" />
        )}
      </div>
      <div aria-hidden className="vt-ccard__shade" />
      <span aria-hidden className="vt-ccard__arrow">
        <ArrowUpRight className="size-5" strokeWidth={1.6} />
      </span>
      <div className="vt-ccard__body">
        {eyebrow && <p className="vt-ccard__eyebrow">{eyebrow}</p>}
        <h3 className="vt-ccard__title">
          <span className="sr-only">{title}</span>
          <span aria-hidden>
            {[...title].map((char, i) => (
              <span key={i} className="vt-ccard__char" style={{ '--i': i } as CSSProperties}>
                {char === ' ' ? ' ' : char}
              </span>
            ))}
          </span>
        </h3>
        {children && <div className="vt-ccard__text">{children}</div>}
      </div>
    </article>
  );
}
