import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * Results — reference 'Ergebnisse' / 'Das sagen Teilnehmer': client voices as chamfered cards,
 * three per row. A card shows its CMS medium (video testimonial or before/after photo) on top
 * when one is assigned, then the accent quote mark, the quote, and the person with the result
 * figure as a small label. Everything comes from the CMS; with no items only the intro shows.
 */
export function ResultsSection({ content, id }: SectionProps<'results'>) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section vf-section--rule">
      <Container>
        <FxIntro
          eyebrow={content.eyebrow}
          title={content.title}
          lead={content.intro}
          titleId={titleId}
        />
        {content.items.length > 0 && (
          <ul className="vf-grid vf-grid--3 vf-mt">
            {content.items.map((item) => (
              <li key={item.id} className="vf-voice">
                {item.media && (
                  <div className="vf-voice__media">
                    <CmsMedia slot={item.media} sizes="(min-width: 1024px) 400px, 90vw" />
                  </div>
                )}
                <div className="vf-voice__body">
                  <span aria-hidden className="vf-voice__mark">
                    “
                  </span>
                  {item.description && (
                    <blockquote className="vf-voice__text">
                      <p>{item.description}</p>
                    </blockquote>
                  )}
                  <p className="vf-voice__who">
                    {item.label}
                    {item.value && <span className="vf-voice__value"> · {item.value}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
