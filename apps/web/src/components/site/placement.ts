import type { WebsiteSectionType } from '@vitruv/shared';

export type SectionPlacement = 'main' | 'footer' | 'meta';

/**
 * Where a section type renders: inside `<main>` (in CMS order) or as the page footer
 * (rendered by the site layout, outside `<main>`). Exhaustive by type.
 */
export const SECTION_PLACEMENT: Readonly<Record<WebsiteSectionType, SectionPlacement>> = {
  hero: 'main',
  results: 'main',
  journey: 'main',
  coaching: 'main',
  packages: 'main',
  about: 'main',
  faq: 'main',
  cta: 'main',
  footer: 'footer',
  pillars: 'main',
  situations: 'main',
  gallery: 'main',
  home: 'main',
  steps: 'main',
  // Design settings (colours): applied by the site layout, never rendered as content.
  theme: 'meta',
  // Page settings: used for metadata/structured data, never rendered as content.
  seo: 'meta',
};

export function placementOf(type: WebsiteSectionType): SectionPlacement {
  return SECTION_PLACEMENT[type];
}
