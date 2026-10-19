import { publicSectionContentSchemas, type PublicWebsiteSection } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';
import { PublicSection } from '@/components/site/section-registry';
import { Container } from '@/components/ui';
import { ErrorState } from '../states';

/**
 * Renders resolved draft (or published) content for the CMS preview with the SAME production
 * renderers as the public homepage (public section registry) — what you preview is what
 * visitors get after publishing.
 */
export function SectionPreview({
  type,
  sectionKey,
  content,
}: {
  type: WebsiteSectionType;
  /** Anchor id used on the public page (the section's CMS key). */
  sectionKey?: string;
  content: Record<string, unknown>;
}) {
  const parsed = publicSectionContentSchemas[type].safeParse(content);
  if (!parsed.success) {
    return (
      <Container className="py-16">
        <ErrorState
          title="Vorschau nicht möglich"
          message="Der gespeicherte Inhalt entspricht nicht dem aktuellen Schema. Bitte im Editor korrigieren und erneut speichern."
        />
      </Container>
    );
  }
  const section = { key: sectionKey ?? type, type, content: parsed.data } as PublicWebsiteSection;
  return <PublicSection section={section} />;
}
