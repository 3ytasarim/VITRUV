import type { PublicWebsiteSection } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';
import type { ComponentType } from 'react';
import { JourneyMapSection } from '@/components/journey';
import { ReferenceHome } from './reference/reference-home';
import type { SectionProps } from './section-props';
import { AboutSection } from './sections/about-section';
import { CoachingSection } from './sections/coaching-section';
import { CtaSection } from './sections/cta-section';
import { FaqSection } from './sections/faq-section';
import { GallerySection } from './sections/gallery-section';
import { HeroSection } from './sections/hero-section';
import { PackagesSection } from './sections/packages-section';
import { PillarsSection } from './sections/pillars-section';
import { ResultsSection } from './sections/results-section';
import { SiteFooter } from './sections/site-footer';
import { SituationsSection } from './sections/situations-section';
import { StepsSection } from './sections/steps-section';

/**
 * Public section registry: section type → production renderer.
 *
 * Exhaustive by construction — a section type added to the contracts does not compile until it
 * has a renderer here. The page renders sections in API order (DB `sort_order`, disabled ones
 * already removed by the API); nothing depends on the order of this object.
 */
export const PUBLIC_SECTION_RENDERERS: {
  readonly [T in WebsiteSectionType]: ComponentType<SectionProps<T>>;
} = {
  hero: HeroSection,
  results: ResultsSection,
  // The existing production Journey component consumes the public contract directly.
  journey: ({ content, id }) => <JourneyMapSection content={content} id={id} />,
  coaching: CoachingSection,
  packages: PackagesSection,
  about: AboutSection,
  faq: FaqSection,
  cta: CtaSection,
  footer: SiteFooter,
  pillars: PillarsSection,
  situations: SituationsSection,
  steps: StepsSection,
  gallery: GallerySection,
  // The reference homepage (all copy + media slots of the prototype page).
  home: ({ content }) => <ReferenceHome content={content} />,
  // Colours are applied by the site layout (CSS variables) — nothing to render here.
  theme: () => null,
  // Page settings (metadata + structured data) — nothing to render in the page body.
  seo: () => null,
};

/**
 * Renders one published section. Unknown types (version skew) render nothing instead of
 * breaking the page; invalid sections were already dropped by the API and the data layer.
 */
export function PublicSection({ section }: { section: PublicWebsiteSection }) {
  const Renderer = PUBLIC_SECTION_RENDERERS[section.type] as
    ComponentType<{ content: unknown; id: string }> | undefined;
  if (!Renderer) return null;
  return <Renderer content={section.content} id={section.key} />;
}
