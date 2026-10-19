import type { ResolvedMedia, ResolvedMediaSlot } from '@vitruv/contracts';
import { getImageProps } from 'next/image';
import { AmbientVideo } from './ambient-video';

/** Below this width the optional mobile variant of a slot is used. Matches Tailwind `md`. */
const MOBILE_QUERY = '(max-width: 767px)';

function objectPosition(focalPoint?: { x: number; y: number }) {
  return focalPoint ? `${focalPoint.x * 100}% ${focalPoint.y * 100}%` : undefined;
}

function imageProps(media: ResolvedMedia, sizes: string, priority: boolean) {
  return getImageProps({
    src: media.url,
    alt: media.altText,
    fill: true,
    sizes,
    quality: 75,
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : 'auto',
  }).props;
}

/**
 * One optimised URL for a video poster (the poster attribute can not take a srcset): the image
 * optimiser delivers it as AVIF/WebP at ~1920 px instead of the original upload.
 */
export function posterSrc(poster: ResolvedMedia): string {
  const width = 960; // → optimiser width 1920 (2x)
  const height =
    poster.width && poster.height ? Math.round((width * poster.height) / poster.width) : 540;
  return getImageProps({ src: poster.url, alt: '', width, height, quality: 70 }).props.src;
}

/**
 * Renders a CMS media slot (image or video, with optional mobile art direction).
 *
 * This is the ONLY way editorial website media reaches the page: sections receive a
 * `ResolvedMediaSlot` from published CMS content and never reference files directly.
 *
 * Images go through Next.js image optimisation (responsive srcset, AVIF/WebP) and fill their
 * fixed-ratio parent (`MediaFrame` or a positioned container) — no layout shift.
 * Videos use `AmbientVideo` (muted, inline, viewport-driven, poster first).
 */
export function CmsMedia({
  slot,
  className,
  priority = false,
  sizes = '100vw',
  mobileSizes = '100vw',
}: {
  slot: ResolvedMediaSlot;
  className?: string;
  /** Above-the-fold media (hero): eager load, high fetch priority, video metadata preload. */
  priority?: boolean;
  /** `sizes` for the desktop asset (layout width of the media box). */
  sizes?: string;
  /** `sizes` for the mobile variant. */
  mobileSizes?: string;
}) {
  const { desktop, mobile, poster } = slot;
  const position = { objectPosition: objectPosition(desktop.focalPoint) };

  if (desktop.kind === 'VIDEO') {
    return (
      <AmbientVideo
        desktop={desktop}
        mobile={mobile?.kind === 'VIDEO' ? mobile : undefined}
        posterUrl={poster?.kind === 'IMAGE' ? posterSrc(poster) : undefined}
        priority={priority}
        className={className}
        style={position}
      />
    );
  }

  const { style, ...desktopImg } = imageProps(desktop, sizes, priority);
  const mobileImg = mobile?.kind === 'IMAGE' ? imageProps(mobile, mobileSizes, priority) : null;
  return (
    <picture>
      {mobileImg && (
        <source media={MOBILE_QUERY} srcSet={mobileImg.srcSet} sizes={mobileImg.sizes} />
      )}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps (CMS alt text) */}
      <img {...desktopImg} className={className} style={{ ...style, ...position }} />
    </picture>
  );
}
