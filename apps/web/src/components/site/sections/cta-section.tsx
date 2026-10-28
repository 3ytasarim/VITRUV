import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxButton } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * Closing call to action — reference 'Starte, wo du stehst': a centred band on the sunken
 * colour with the CMS medium dimmed behind it, eyebrow, the italic uppercase headline, the CMS
 * copy and the single CMS action as the chamfered accent button.
 */
export function CtaSection({ content, id }: SectionProps<'cta'>) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-cta">
      {content.media && (
        <div aria-hidden className="vf-cta__media">
          <CmsMedia slot={content.media} sizes="100vw" />
        </div>
      )}
      <Container className="vf-cta__inner">
        {content.eyebrow && <p className="vf-eyebrow">{content.eyebrow}</p>}
        <h2 id={titleId} className="vf-cta__title">
          {content.title}
        </h2>
        {content.body && <p className="vf-cta__body">{content.body}</p>}
        <FxButton href={content.action.href} data-track="cta_click" data-track-section="cta">
          {content.action.label}
        </FxButton>
      </Container>
    </section>
  );
}
