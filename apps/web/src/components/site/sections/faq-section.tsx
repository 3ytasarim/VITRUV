import { Section, SectionIntro } from '@/components/ui';
import type { SectionProps } from '../section-props';
import { FaqAccordion } from './faq-accordion';

/** FAQ: introduction beside an accessible disclosure list (all content from the CMS). */
export function FaqSection({ content, id }: SectionProps<'faq'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} divider>
      <div className="grid gap-10 lg:grid-cols-[4fr_8fr] lg:gap-16">
        <SectionIntro
          align="start"
          eyebrow={content.eyebrow}
          title={content.title}
          titleId={titleId}
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <FaqAccordion items={content.items} />
      </div>
    </Section>
  );
}
