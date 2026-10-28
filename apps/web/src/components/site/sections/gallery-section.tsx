import { CmsMedia } from '@/components/cms/cms-media';
import { Container } from '@/components/ui';
import { FxIntro, FxTitle } from '../fx';
import type { SectionProps } from '../section-props';

/**
 * "Einblicke" — reference 'Im Training': CMS photos as tall rounded cards with a short accent
 * label and caption on a shade at the bottom, in a horizontal swipe row (scroll snap; four cards
 * per view on desktop). Keyboard: the row is a focusable, labelled region. Renders nothing until
 * at least one photo is set.
 */
export function GallerySection({ content, id }: SectionProps<'gallery'>) {
  const items = content.items.flatMap((item) =>
    item.media ? [{ ...item, media: item.media }] : [],
  );
  if (items.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section">
      <Container>
        <FxIntro
          eyebrow={content.eyebrow}
          title={<FxTitle title={content.title} highlight={content.highlight} />}
          lead={content.intro}
          titleId={titleId}
        />
        {items.length > 4 && (
          <p aria-hidden className="vf-swipe-hint">
            Wischen →
          </p>
        )}
        <ul className="vf-rail vf-rail--4" tabIndex={0} aria-label={content.title}>
          {items.map((item) => (
            <li key={item.id} className="vf-shot">
              <CmsMedia slot={item.media} sizes="(min-width: 1024px) 300px, 70vw" />
              {(item.title || item.caption) && (
                <div className="vf-shot__text">
                  {item.title && <p className="vf-eyebrow">{item.title}</p>}
                  {item.caption && <p className="vf-shot__caption">{item.caption}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
