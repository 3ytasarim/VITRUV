import type { ResolvedMediaSlot } from '@vitruv/contracts';

/**
 * How the hero presents its CMS media — one decision shared by the hero and the header (so the
 * header always matches what is behind it):
 *  - 'plain' — no media: light aurora hero, light header;
 *  - 'stage' — media (video or photo, any orientation): full-bleed background behind the copy,
 *    fading into the page colour at the bottom; the header starts light-on-dark over it.
 */
export type HeroLayout = 'plain' | 'stage';

export function heroLayout(media: ResolvedMediaSlot | null | undefined): HeroLayout {
  return media ? 'stage' : 'plain';
}
