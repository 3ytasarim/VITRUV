import { Container, Section, SectionIntro } from '@/components/ui';
import { KineticGallery, type GallerySlide } from '../effects/kinetic-gallery';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';

/**
 * "Einblicke" — training photos from the CMS (Media Library) as a kinetic reel: the section pins
 * on desktop and the photos run sideways with the scroll. Renders nothing until at least one
 * photo is set.
 */
export function GallerySection({ content, id }: SectionProps<'gallery'>) {
  const slides: GallerySlide[] = content.items.flatMap((item) =>
    item.media ? [{ ...item, media: item.media }] : [],
  );
  if (slides.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} contained={false} className="vt-gallery">
      <Container>
        <SectionIntro
          eyebrow={content.eyebrow}
          title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
          lead={content.intro}
          titleId={titleId}
        />
      </Container>
      <KineticGallery
        slides={slides}
        autoplay={content.autoplay}
        label={content.title}
        ghost={content.highlight || content.title}
      />
    </Section>
  );
}
