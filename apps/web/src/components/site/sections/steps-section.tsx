import { CmsMedia } from '@/components/cms/cms-media';
import { Section, SectionIntro } from '@/components/ui';
import { PointerField } from '../effects/pointer-field';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';

type Step = SectionProps<'steps'>['content']['items'][number];

/** Groups steps by their pillar label, keeping the CMS order of first appearance. */
function groupSteps(items: readonly Step[]) {
  const groups = new Map<string, { step: Step; number: number }[]>();
  items.forEach((step, index) => {
    const list = groups.get(step.group) ?? [];
    list.push({ step, number: index + 1 });
    groups.set(step.group, list);
  });
  return [...groups.entries()];
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * "Neun Stufen" — three tall pillar panels (Körper · Seele · Geist), each a warm-to-ink gradient
 * card with a giant faded numeral and its steps as an icon list. Panels tilt towards the pointer
 * and carry a moving light sheen (patterns adapted from the Meridius "animated-3d-card" and the
 * big faded index of its parallax feature rows; tilt via PointerField, CSS only, off for touch and
 * reduced motion). Steps keep their global numbering 01–09.
 */
export function StepsSection({ content, id }: SectionProps<'steps'>) {
  const titleId = `${id}-title`;
  const groups = groupSteps(content.items);
  return (
    <Section id={id} labelledBy={titleId} divider className="vt-steps-section">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
        lead={content.intro}
        titleId={titleId}
      />
      {groups.length > 0 && (
        <PointerField className="vt-panels mt-16 md:mt-24">
          {groups.map(([group, steps], groupIndex) => (
            <section
              key={group}
              className="vt-panel vt-on-media"
              data-pointer=""
              data-tone={groupIndex % 3}
              aria-labelledby={`${id}-group-${groupIndex}`}
            >
              <span aria-hidden className="vt-panel__numeral">
                {ROMAN[groupIndex] ?? groupIndex + 1}
              </span>
              <span aria-hidden className="vt-panel__sheen" />
              <header className="vt-panel__head">
                <p className="type-caption text-fg-subtle">
                  {String(groupIndex + 1).padStart(2, '0')} /{' '}
                  {String(groups.length).padStart(2, '0')}
                </p>
                <h3 id={`${id}-group-${groupIndex}`} className="vt-panel__title">
                  {group}
                </h3>
              </header>
              <ol className="vt-panel__steps">
                {steps.map(({ step, number }) => (
                  <li key={step.id} className="vt-panel__step">
                    {step.icon ? (
                      <span aria-hidden className="vt-panel__icon">
                        <CmsMedia slot={step.icon} sizes="56px" />
                      </span>
                    ) : (
                      <span aria-hidden className="vt-panel__icon vt-panel__icon--num">
                        {String(number).padStart(2, '0')}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <h4 className="vt-panel__step-title">
                        <span aria-hidden className="vt-panel__step-num">
                          {String(number).padStart(2, '0')}
                        </span>
                        {step.title}
                      </h4>
                      <p className="type-body-sm text-fg-muted">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </PointerField>
      )}
    </Section>
  );
}
