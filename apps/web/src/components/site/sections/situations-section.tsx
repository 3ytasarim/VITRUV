import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, FxTitle } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * "Lebenssituationen" — reference 'Wo die meisten starten': each starting point as a rounded
 * quote card (accent quote mark or the owner's CMS line icon, the situation in italics, the
 * description below), three per row; the CMS closing line follows the grid.
 */
export function SituationsSection({ content, id }: SectionProps<'situations'>) {
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
          <ul className="vf-grid vf-grid--3 vf-mt">
            {content.items.map((item) => (
              <li key={item.id} className="vf-quote">
                {item.icon ? (
                  <span aria-hidden className="vf-quote__icon">
                    <CmsMedia slot={item.icon} sizes="40px" />
                  </span>
                ) : (
                  <span aria-hidden className="vf-quote__mark">
                    ”
                  </span>
                )}
                <h3 className="vf-quote__title">{item.title}</h3>
                {item.description && <p className="vf-quote__text">{item.description}</p>}
              </li>
            ))}
          </ul>
        )}
        {content.outro && <p className="vf-outro">{content.outro}</p>}
      </Container>
    </section>
  );
}
