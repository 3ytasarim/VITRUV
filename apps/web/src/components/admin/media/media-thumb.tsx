'use client';

import type { AdminMediaAsset } from '@vitruv/contracts';
import { FileQuestion, Video } from 'lucide-react';
import { getImageProps } from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';

/** Width of the preview the browser downloads for a tile (sharp on 2× screens, ~10-30 KB). */
const THUMB_WIDTH = 320;

/**
 * Small preview of a library asset. Decorative in the admin UI (alt="" / aria-hidden): the file
 * name and metadata are always shown as text next to it.
 *
 * PERFORMANCE (libraries with hundreds of assets): images load a small optimised preview instead
 * of the full file; videos render a light placeholder and only attach a `<video>` (first frame,
 * muted, no autoplay) once the tile scrolls into view — so opening the library never starts
 * hundreds of video downloads at once. The stored media themselves are untouched.
 */
export function MediaThumb({
  asset,
  className,
}: {
  asset: Pick<AdminMediaAsset, 'kind' | 'url' | 'mimeType' | 'width' | 'height'> | undefined;
  className?: string;
}) {
  if (!asset) {
    return (
      <div
        aria-hidden
        className={cx('vt-thumb flex items-center justify-center text-fg-subtle', className)}
      >
        <FileQuestion className="size-6" />
      </div>
    );
  }
  if (asset.kind === 'VIDEO') return <LazyVideoThumb url={asset.url} className={className} />;
  const ratio = asset.width && asset.height ? asset.height / asset.width : 0.75;
  const { props } = getImageProps({
    src: asset.url,
    alt: '',
    width: THUMB_WIDTH,
    height: Math.round(THUMB_WIDTH * ratio),
    quality: 70,
    sizes: `${THUMB_WIDTH}px`,
  });
  return (
    <img {...props} alt="" className={cx('vt-thumb', className)} loading="lazy" decoding="async" />
  );
}

function LazyVideoThumb({ url, className }: { url: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '150px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return (
    <div ref={ref} aria-hidden className={cx('vt-thumb vt-thumb--video', className)}>
      {near ? (
        <video src={`${url}#t=0.1`} muted playsInline preload="metadata" />
      ) : (
        <Video className="size-6" />
      )}
    </div>
  );
}
