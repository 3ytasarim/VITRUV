import { Section, SectionIntro } from '@/components/ui';
import { ColorChangeCard } from '../effects/color-change-card';
import type { SectionProps } from '../section-props';

/**
 * Coaching: the working method as a row of colour-change cards (21st.dev "Color Change Card"
 * pattern) — three across on wide screens, numbered in CMS order. Each card shows the feature's
 * CMS card image (grey until hover/focus, then full colour) under its title and description.
 * The section medium (if set) is no longer shown here; card images carry the visuals.
 */
export function CoachingSection({ content, id }: SectionProps<'coaching'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} tone="sunken" divider>
      <SectionIntro
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.intro}
        titleId={titleId}
      />
      {content.features.length > 0 && (
        <ol className="vt-ccards mt-12 md:mt-16">
          {content.features.map((feature, index) => (
            <li key={feature.id}>
              <ColorChangeCard
                title={feature.title}
                eyebrow={String(index + 1).padStart(2, '0')}
                media={feature.media ?? null}
              >
                {feature.description}
              </ColorChangeCard>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
