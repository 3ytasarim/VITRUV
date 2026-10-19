import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ImageIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { type ChamferCut, chamfer } from './chamfer';
import { cx } from './cx';

/** Supported aspect ratios — Tailwind `aspect-*` utilities, so the box is reserved before load. */
export type MediaRatio = '21/9' | '16/9' | '3/2' | '4/3' | '1/1' | '4/5' | '3/4' | '9/16';

const RATIO_CLASS: Record<MediaRatio, string> = {
  '21/9': 'aspect-21/9',
  '16/9': 'aspect-video',
  '3/2': 'aspect-3/2',
  '4/3': 'aspect-4/3',
  '1/1': 'aspect-square',
  '4/5': 'aspect-4/5',
  '3/4': 'aspect-3/4',
  '9/16': 'aspect-9/16',
};

/**
 * Fixed-ratio frame for editorial images/videos. The ratio box exists before any media loads,
 * so there is no layout shift; media is cropped with object-fit: cover.
 *
 * Content is always passed in: a CMS `slot` (rendered by `CmsMedia`) or custom `children`.
 * With neither, an accessible placeholder is shown ("media pending").
 */
export function MediaFrame({
  ratio = '16/9',
  shape = 'chamfer',
  cut = 'lg',
  slot,
  priority,
  sizes,
  placeholderLabel = 'Medium folgt',
  className,
  children,
}: {
  ratio?: MediaRatio;
  /** chamfer = brand cut corners · rounded = large-radius frame (prototype video panels) */
  shape?: 'chamfer' | 'rounded';
  cut?: ChamferCut;
  slot?: ResolvedMediaSlot;
  priority?: boolean;
  /** Rendered width of the frame for responsive images, e.g. "(min-width: 768px) 50vw, 100vw". */
  sizes?: string;
  placeholderLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  const content = slot ? (
    <CmsMedia slot={slot} priority={priority} sizes={sizes} mobileSizes={sizes} />
  ) : (
    (children ?? (
      <div className="flex size-full flex-col items-center justify-center gap-2 text-fg-subtle">
        <ImageIcon aria-hidden className="size-6" />
        <span className="type-caption">{placeholderLabel}</span>
      </div>
    ))
  );

  return (
    <div
      className={cx(
        shape === 'chamfer' ? chamfer(cut, 'vt-media') : 'vt-media vt-media--rounded',
        RATIO_CLASS[ratio],
        className,
      )}
    >
      <div className="vt-media__clip">{content}</div>
    </div>
  );
}
