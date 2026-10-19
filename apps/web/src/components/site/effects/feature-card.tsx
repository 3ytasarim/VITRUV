import type { ResolvedMediaSlot } from '@vitruv/contracts';
import type { ReactNode } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { cx } from '@/components/ui';

export type FeatureTone = 'gold' | 'route' | 'ink';

/**
 * Animated feature card — the 21st.dev "feature-card-1" (ravikatiyar162) pattern as used on
 * Meridius.ch, re-built on VITRUV tokens with CSS only (no framer-motion): index number top left,
 * a tag pill, the illustration floating on a coloured light cone in the middle, and a frosted
 * content panel at the bottom. Hover / focus-within: the card lifts, the illustration grows and
 * rises (spring-like easing). Reduced motion: no movement. The illustration is decorative; the
 * panel carries the text.
 */
export function FeatureCard({
  index,
  tag,
  tone = 'gold',
  media,
  children,
  className,
}: {
  index: string;
  tag?: ReactNode;
  tone?: FeatureTone;
  media?: ResolvedMediaSlot | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={cx('vt-fcard', className)} data-tone={tone}>
      <div aria-hidden className="vt-fcard__glow" />
      <div className="vt-fcard__top">
        <span aria-hidden className="vt-fcard__index">
          {index}
        </span>
        {tag && <span className="vt-fcard__tag">{tag}</span>}
      </div>
      {media && (
        <div aria-hidden className="vt-fcard__art">
          <div className="vt-fcard__art-img">
            <CmsMedia slot={media} sizes="(min-width: 1024px) 18rem, 60vw" />
          </div>
        </div>
      )}
      <div className="vt-fcard__panel">{children}</div>
    </article>
  );
}
