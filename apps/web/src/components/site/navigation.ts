import type {
  Cta,
  PublicWebsitePage,
  PublicWebsiteSection,
  ResolvedMediaSlot,
} from '@vitruv/contracts';
import { heroLayout } from './hero-layout';
import { placementOf } from './placement';

export interface NavLink {
  label: string;
  href: string;
}

/** `#faq` or `/#faq` → `faq`; anything else (pages, external, mailto) → null. */
export function anchorOf(href: string): string | null {
  const match = /^\/?#([A-Za-z][\w-]*)$/.exec(href);
  return match ? (match[1] ?? null) : null;
}

/** Anchors of the sections rendered in <main> (= CMS keys of published, enabled sections). */
function renderedAnchors(page: PublicWebsitePage): Set<string> {
  return new Set(page.sections.filter((s) => placementOf(s.type) === 'main').map((s) => s.key));
}

/** A link is kept unless it points to an in-page anchor whose section is not rendered. */
function isLive(href: string, anchors: Set<string>): boolean {
  const anchor = anchorOf(href);
  return anchor === null || anchors.has(anchor);
}

/**
 * The published footer section with dead in-page links removed (e.g. to a disabled section), so
 * neither header nor footer ever points at a section that is not on the page.
 */
export function liveFooter(page: PublicWebsitePage): PublicWebsiteSection | undefined {
  const footer = page.sections.find((s) => s.type === 'footer');
  if (footer?.type !== 'footer') return undefined;
  const anchors = renderedAnchors(page);
  return {
    ...footer,
    content: {
      ...footer.content,
      navigation: footer.content.navigation.filter((link) => isLive(link.href, anchors)),
      legal: footer.content.legal.filter((link) => isLive(link.href, anchors)),
    },
  };
}

/**
 * Header navigation, derived from published CMS content — no hardcoded menu copy:
 *   items = the footer's navigation links, minus anchors whose section is not rendered
 *           (disabled / unpublished sections never get a dead menu entry);
 *   cta   = the closing CTA section's action (only if that section is published + enabled).
 */
export interface SiteNavigation {
  items: NavLink[];
  cta: Cta | null;
  /** Site logo from the published page settings (seo.logo); wordmark when unset. */
  logo: ResolvedMediaSlot | null;
  /** The first section is a hero: the header floats over it (no separate colour band). */
  overHero: boolean;
  /** Header light-on-dark over hero media (full-bleed stage). */
  heroDark: 'stage' | false;
}

function heroDarkOf(media: ResolvedMediaSlot | null | undefined): SiteNavigation['heroDark'] {
  return heroLayout(media) === 'stage' ? 'stage' : false;
}

export function buildNavigation(page: PublicWebsitePage): SiteNavigation {
  const footer = liveFooter(page);
  const items =
    footer?.type === 'footer'
      ? footer.content.navigation.map(({ label, href }) => ({ label, href }))
      : [];
  const cta = page.sections.find((s) => s.type === 'cta');
  const seo = page.sections.find((s) => s.type === 'seo');
  const first = page.sections.find((s) => placementOf(s.type) === 'main');
  return {
    items,
    cta: cta?.type === 'cta' ? cta.content.action : null,
    logo: seo?.type === 'seo' ? (seo.content.logo ?? null) : null,
    overHero: first?.type === 'hero',
    heroDark: heroDarkOf(first?.type === 'hero' ? first.content.media : null),
  };
}
