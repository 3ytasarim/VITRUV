import type { PublicSectionContent } from '@vitruv/contracts';
import type { WebsiteSectionType } from '@vitruv/shared';

/** Props of every public section renderer: published content + stable DOM anchor (= CMS key). */
export interface SectionProps<T extends WebsiteSectionType> {
  content: PublicSectionContent<T>;
  /** Stable anchor id — the section's CMS key (e.g. `faq`), never a localized title. */
  id: string;
}
