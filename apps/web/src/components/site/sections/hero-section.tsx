import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxButton } from '../fx';
import { splitHighlight } from '../highlighted-title';
import type { SectionProps } from '../section-props';

// Kept as a named export of the hero module for existing imports/tests.
export { splitHighlight } from '../highlighted-title';

/**
 * Opening section — reference 'Website Funktional' hero: the CMS media (ideally a muted video
 * loop + poster) fills the stage behind the copy with a shade from the left and into the page
 * colour at the bottom; "//" eyebrow, the italic uppercase headline (the CMS highlight phrase in
 * the glowing accent colour), lead and two chamfered actions. Without media the same layout
 * stands on the page colour. All content from the CMS.
 */
export function HeroSection({ content, id }: SectionProps<'hero'>) {
  const titleId = `${id}-title`;
  const media = content.media;
  const parts = splitHighlight(content.title, content.highlight);
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="vf-hero"
      data-hero-media={media ? '' : undefined}
    >
      {media && (
        <div className="vf-hero__media">
          <CmsMedia slot={media} priority sizes="100vw" className="h-full w-full object-cover" />
        </div>
      )}
      <div aria-hidden className="vf-hero__shade" />
      <Container className="vf-hero__inner">
        {content.eyebrow && (
          <p className="vf-eyebrow vf-rise">
            <span aria-hidden>{'// '}</span>
            {content.eyebrow}
          </p>
        )}
        <h1 id={titleId} className="vf-hero__title vf-rise vf-rise--2">
          {parts.before}
          {parts.highlight && <span className="vf-hl vf-hl--glow">{parts.highlight}</span>}
          {parts.after}
        </h1>
        {content.body && <p className="vf-hero__body vf-rise vf-rise--3">{content.body}</p>}
        <div className="vf-hero__actions vf-rise vf-rise--4">
          <FxButton
            href={content.primaryCta.href}
            data-track="cta_click"
            data-track-section="hero"
            data-track-label="primary"
          >
            {content.primaryCta.label}
          </FxButton>
          {content.secondaryCta && (
            <FxButton
              href={content.secondaryCta.href}
              variant="ghost"
              data-track="cta_click"
              data-track-section="hero"
              data-track-label="secondary"
            >
              {content.secondaryCta.label}
            </FxButton>
          )}
        </div>
      </Container>
    </section>
  );
}
