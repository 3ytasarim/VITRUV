import { CmsMedia } from '@/components/cms/cms-media';
import { ArrowUpRight } from 'lucide-react';
import { ButtonLink, Container, Eyebrow } from '@/components/ui';
import { HarmonyMotif } from '../harmony-motif';
import { heroLayout } from '../hero-layout';
import { ParticleTitle } from '../effects/particle-title';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';

// Kept as a named export of the hero module for existing imports/tests.
export { splitHighlight } from '../highlighted-title';

/**
 * Opening section — 'Greek Harmony'.
 *
 * With CMS media (ideally a muted video loop + poster) the hero is a full-bleed stage: the media
 * runs directly behind the copy (dark shade top/left for the light copy and the header), and the
 * picture dissolves downwards into the page colour, so the next section continues seamlessly.
 * Without media: the aurora split with the living Vitruvian geometry. All content from the CMS.
 */
export function HeroSection({ content, id }: SectionProps<'hero'>) {
  const titleId = `${id}-title`;
  const media = content.media;
  const layout = heroLayout(media);

  const actions = (
    <div className="vt-rise vt-rise--4 mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
      <ButtonLink
        href={content.primaryCta.href}
        size="lg"
        icon={<ArrowUpRight />}
        iconPosition="end"
        className="w-full sm:w-auto"
        data-track="cta_click"
        data-track-section="hero"
        data-track-label="primary"
      >
        {content.primaryCta.label}
      </ButtonLink>
      {content.secondaryCta && (
        <ButtonLink
          href={content.secondaryCta.href}
          size="lg"
          variant="secondary"
          className="w-full sm:w-auto"
          data-track="cta_click"
          data-track-section="hero"
          data-track-label="secondary"
        >
          {content.secondaryCta.label}
        </ButtonLink>
      )}
    </div>
  );

  if (media && layout === 'stage') {
    return (
      <section id={id} aria-labelledby={titleId} className="vt-hero-stage" data-hero-media="">
        <div className="vt-hero-stage__media">
          <CmsMedia slot={media} priority sizes="100vw" className="h-full w-full object-cover" />
        </div>
        <div aria-hidden className="vt-hero-stage__shade" />
        <Container className="vt-on-media vt-hero-stage__inner">
          <div className="flex max-w-3xl flex-col gap-6">
            {content.eyebrow && (
              <Eyebrow className="vt-rise vt-hero-stage__eyebrow">{content.eyebrow}</Eyebrow>
            )}
            <h1
              id={titleId}
              className="vt-rise vt-rise--2 type-h1 sm:type-display text-balance break-words hyphens-auto"
            >
              <HighlightedTitle title={content.title} highlight={content.highlight} />
              <ParticleTitle />
            </h1>
            {content.body && (
              <p className="vt-rise vt-rise--3 type-body-lg max-w-measure text-fg-muted">
                {content.body}
              </p>
            )}
            {actions}
          </div>
        </Container>
      </section>
    );
  }

  // Without media: editorial split on a slow warm aurora (pattern from the Meridius aurora/mesh
  // backgrounds + hero badge) with the living Vitruvian geometry on the right.
  return (
    <section id={id} aria-labelledby={titleId} className="vt-hero-aurora">
      <div aria-hidden className="vt-aurora">
        <span />
        <span />
        <span />
      </div>
      <Container className="vt-hero-aurora__inner">
        <div className="vt-hero-aurora__copy">
          {content.eyebrow && (
            <p className="vt-rise vt-hero-pill">
              <span aria-hidden className="vt-hero-pill__dot" />
              {content.eyebrow}
            </p>
          )}
          {/* Phones use the h1 scale (long German compounds), display size from sm. */}
          <h1
            id={titleId}
            className="vt-rise vt-rise--2 vt-hero-aurora__title text-balance break-words"
          >
            <HighlightedTitle title={content.title} highlight={content.highlight} />
            <ParticleTitle />
          </h1>
          {content.body && (
            <p className="vt-rise vt-rise--3 type-body-lg max-w-measure text-fg-muted">
              {content.body}
            </p>
          )}
          {actions}
        </div>
        <div aria-hidden className="vt-hero-orbit vt-rise vt-rise--3">
          <svg viewBox="0 0 200 200" className="vt-hero-orbit__ring" focusable="false">
            <circle cx="100" cy="100" r="96" />
            <circle cx="100" cy="100" r="86" className="vt-hero-orbit__ticks" />
          </svg>
          <HarmonyMotif className="vt-hero-orbit__motif" />
          <span className="vt-hero-orbit__spinner">
            <span className="vt-hero-orbit__dot" />
          </span>
        </div>
      </Container>
    </section>
  );
}
