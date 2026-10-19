import { Section, SectionIntro } from '@/components/ui';
import { PackagePanels } from '../effects/package-panels';
import type { SectionProps } from '../section-props';

/**
 * Packages as expanding photo panels (see PackagePanels): the open package shows name, price
 * label, features and its call to action over its photo. Editorial display only — the price is
 * CMS text, nothing is calculated or sold here. A highlighted package is marked by text
 * ("Empfohlen") and opens first, never by colour alone.
 */
export function PackagesSection({ content, id }: SectionProps<'packages'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} divider>
      <SectionIntro
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.intro}
        titleId={titleId}
      />
      {content.packages.length > 0 && (
        <div className="mt-12 md:mt-16">
          <PackagePanels packages={content.packages} />
        </div>
      )}
    </Section>
  );
}
