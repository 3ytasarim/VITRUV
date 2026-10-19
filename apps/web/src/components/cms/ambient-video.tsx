'use client';

import type { ResolvedMedia } from '@vitruv/contracts';
import { useEffect, useRef } from 'react';

/** Below this width the optional mobile variant is used. Matches Tailwind `md`. */
const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Muted, looping, inline background video (no audio, no controls).
 *
 * - Server HTML has NO autoplay: without JavaScript the poster is shown.
 * - Plays only while at least a quarter of it is visible and pauses when scrolled away, so
 *   several videos never play at once.
 * - Never plays with `prefers-reduced-motion: reduce` or the Save-Data hint — the poster stays.
 * - `preload`: "metadata" for the above-the-fold hero, "none" everywhere else.
 */
export function AmbientVideo({
  desktop,
  mobile,
  posterUrl,
  priority = false,
  className,
  style,
}: {
  desktop: ResolvedMedia;
  mobile?: ResolvedMedia;
  posterUrl?: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true;
    if (reduced || saveData) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined);
        else video.pause();
      },
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, []);

  const decorative = desktop.altText === '';
  return (
    <video
      ref={ref}
      className={className}
      style={style}
      muted
      loop
      playsInline
      preload={priority ? 'metadata' : 'none'}
      poster={posterUrl}
      aria-label={decorative ? undefined : desktop.altText}
      aria-hidden={decorative ? true : undefined}
    >
      {mobile && <source src={mobile.url} type={mobile.mimeType} media={MOBILE_QUERY} />}
      <source src={desktop.url} type={desktop.mimeType} />
    </video>
  );
}
