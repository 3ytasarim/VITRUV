import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, FxTitle, nn } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * "Neun Stufen" — reference 'So läuft es ab': a ruled list, one row per step with the large
 * accent number, title and description; the group label (pillar) and the owner's CMS line icon
 * sit at the end of the row. Numbering runs across all steps in CMS order.
 */
export function StepsSection({ content, id }: SectionProps<'steps'>) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section vf-section--rule">
      <Container>
        <FxIntro
          eyebrow={content.eyebrow}
          title={<FxTitle title={content.title} highlight={content.highlight} />}
          lead={content.intro}
          titleId={titleId}
        />
        {content.items.length > 0 && (
          <ol className="vf-steps vf-mt-sm">
            {content.items.map((step, index) => (
              <li key={step.id} className="vf-step">
                <span aria-hidden className="vf-step__num">
                  {nn(index + 1)}
                </span>
                <div className="vf-step__copy">
                  <h3 className="vf-step__title">{step.title}</h3>
                  <p className="vf-step__text">{step.description}</p>
                </div>
                <div className="vf-step__aside">
                  <span className="vf-meta">{step.group}</span>
                  {step.icon && (
                    <span aria-hidden className="vf-step__icon">
                      <CmsMedia slot={step.icon} sizes="44px" />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Container>
    </section>
  );
}
