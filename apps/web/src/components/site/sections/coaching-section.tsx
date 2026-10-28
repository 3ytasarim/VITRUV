import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, nn } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * Coaching — reference 'Was drin ist': a large rounded panel with the intro and the features as
 * numbered cards (01, 02 … in the accent colour beside title and description), three across on
 * wide screens. A feature's CMS card image, if assigned, sits on top of its card.
 */
export function CoachingSection({ content, id }: SectionProps<'coaching'>) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section">
      <Container>
        <div className="vf-panel">
          <FxIntro
            eyebrow={content.eyebrow}
            title={content.title}
            lead={content.intro}
            titleId={titleId}
          />
          {content.features.length > 0 && (
            <ol className="vf-grid vf-grid--3 vf-mt-sm">
              {content.features.map((feature, index) => (
                <li key={feature.id} className="vf-feature">
                  {feature.media && (
                    <div className="vf-feature__media">
                      <CmsMedia slot={feature.media} sizes="(min-width: 1024px) 360px, 90vw" />
                    </div>
                  )}
                  <div className="vf-feature__row">
                    <span aria-hidden className="vf-feature__num">
                      {nn(index + 1)}
                    </span>
                    <div>
                      <h3 className="vf-feature__title">{feature.title}</h3>
                      <p className="vf-feature__text">{feature.description}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Container>
    </section>
  );
}
