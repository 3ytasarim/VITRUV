import { Container } from '@/components/ui';
import { FxIntro } from '../fx';
import type { SectionProps } from '../section-props';
import { FaqAccordion } from './faq-accordion';

/** FAQ — reference 'Bevor du dich bewirbst': rounded panel, intro, accessible disclosure list. */
export function FaqSection({ content, id }: SectionProps<'faq'>) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className="vf-section vf-section--tight">
      <Container>
        <div className="vf-panel">
          <FxIntro eyebrow={content.eyebrow} title={content.title} titleId={titleId} />
          <FaqAccordion items={content.items} />
        </div>
      </Container>
    </section>
  );
}
