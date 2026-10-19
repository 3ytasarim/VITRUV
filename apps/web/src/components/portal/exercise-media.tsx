import type { ResolvedMedia } from '@vitruv/contracts';

/**
 * Demonstration video/image of an exercise (training media from the API — URLs, never storage
 * keys). Videos never autoplay: the client starts them; `preload="metadata"` keeps pages light.
 */
export function ExerciseMedia({ media, name }: { media: ResolvedMedia; name: string }) {
  const ratio =
    media.width && media.height ? { aspectRatio: `${media.width} / ${media.height}` } : undefined;
  return media.kind === 'VIDEO' ? (
    <video
      className="vt-portal__media"
      style={ratio}
      src={media.url}
      controls
      playsInline
      preload="metadata"
      aria-label={`Video: ${name}`}
    />
  ) : (
    <img
      className="vt-portal__media"
      style={ratio}
      src={media.url}
      alt={media.altText || name}
      loading="lazy"
      decoding="async"
    />
  );
}
