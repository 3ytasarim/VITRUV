import { Section, SectionIntro } from '@/components/ui';
import { PolaroidCarousel, type PolaroidSlide } from '../effects/polaroid-carousel';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';

/**
 * "Einblicke" — photos from the CMS (Media Library) as a hanging polaroid carousel. Renders
 * nothing until at least one photo is set.
 */
export function GallerySection({ content, id }: SectionProps<'gallery'>) {
  const slides: PolaroidSlide[] = content.items.flatMap((item) =>
    item.media ? [{ ...item, media: item.media }] : [],
  );
  if (slides.length === 0) return null;
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} className="vt-gallery">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
        lead={content.intro}
        titleId={titleId}
      />
      <div className="mt-10 md:mt-14">
        <PolaroidCarousel slides={slides} autoplay={content.autoplay} label={content.title} />
      </div>
    </Section>
  );
}
