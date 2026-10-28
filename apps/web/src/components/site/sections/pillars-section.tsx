import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, FxTitle } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * "Drei Säulen" — reference 'Im Training' cards: one tall rounded card per pillar with its CMS
 * illustration on top, the short name as accent label, title, keyword line, lead and facets.
 * All copy and images come from the CMS.
 */
export function PillarsSection({ content, id }: SectionProps<'pillars'>) {
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
        <ul className="vf-grid vf-grid--3 vf-mt">
          {content.pillars.map((pillar) => (
            <li key={pillar.id} className="vf-card vf-pillar">
              {pillar.media && (
                <div className="vf-pillar__media">
                  <div className="vf-pillar__art">
                    <CmsMedia slot={pillar.media} sizes="(min-width: 1024px) 400px, 90vw" />
                  </div>
                </div>
              )}
              <div className="vf-pillar__body">
                <p className="vf-eyebrow">{pillar.name}</p>
                <h3 className="vf-card__title">{pillar.title}</h3>
                {pillar.keywords && <p className="vf-meta">{pillar.keywords}</p>}
                {pillar.lead && <p className="vf-card__text">{pillar.lead}</p>}
                {pillar.facets.length > 0 && (
                  <dl className="vf-facets">
                    {pillar.facets.map((facet) => (
                      <div key={facet.id}>
                        <dt>{facet.label}</dt>
                        <dd>{facet.description}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
