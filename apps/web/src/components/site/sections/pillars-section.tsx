import { Section, SectionIntro } from '@/components/ui';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';
import { PillarsPanels } from './pillars-panels';

/**
 * "Drei Säulen" — Körper · Seele · Geist as expanding panels (see PillarsPanels): the section
 * intro centred above, the three pillars as a row of tall panels that open one at a time.
 * All copy and images come from the CMS.
 */
export function PillarsSection({ content, id }: SectionProps<'pillars'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} divider className="vt-pillars-section">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
        lead={content.intro}
        titleId={titleId}
      />
      <div className="mt-14 md:mt-20">
        <PillarsPanels pillars={content.pillars} baseId={id} />
      </div>
    </Section>
  );
}
