import { Eyebrow, MediaFrame, Section, SectionIntro, cx } from '@/components/ui';
import { JourneyMapMount } from './journey-map-mount';
import type { JourneyContent } from './journey-types';

/**
 * "Dein Weg" — the Journey section, adapted 1:1 from the source prototype
 * (`Website Funktional*.dc.html` → Journey section, data-weg markup) and the
 * topographic route-map reference: a full-width map behind the stages, a route that runs through
 * every stage image, a ghost of the remaining route, a moving progress dot with the live
 * percentage, map elements revealed just ahead of the route, stages alternating left/right.
 *
 * Content: the ordered stage list is real, server-rendered content (readable without JS); the
 * map, route and dot are a decorative, aria-hidden enhancement (`journey-map-engine.ts`).
 */
export function JourneyMapSection({
  content,
  id = 'journey',
}: {
  content: JourneyContent;
  id?: string;
}) {
  const titleId = `${id}-title`;
  const total = String(content.stages.length).padStart(2, '0');
  return (
    <Section id={id} labelledBy={titleId} divider className="vt-weg-section">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={content.title}
        lead={content.lead}
        titleId={titleId}
      />
      <JourneyMapMount className="vt-weg">
        <svg data-weg-svg="" aria-hidden className="vt-weg__svg" preserveAspectRatio="none">
          <path data-weg-ghost="" d="" fill="none" className="vt-weg__ghost" />
          <path data-weg-line="" d="" fill="none" className="vt-weg__line" />
        </svg>
        <div data-weg-dot="" aria-hidden className="vt-weg__dot">
          <span className="vt-weg__dot-core" />
          <span className="vt-weg__dot-label">
            <span>Fortschritt</span>
            <span data-weg-pct="">0%</span>
          </span>
        </div>
        <ol className="vt-weg__list">
          {content.stages.map((stage, i) => (
            <li
              key={stage.id}
              data-weg-m=""
              className={cx('vt-weg__m', i % 2 === 1 && 'vt-weg__m--reverse')}
            >
              <div data-weg-img="" className="vt-weg__img">
                <MediaFrame
                  ratio="3/4"
                  shape="rounded"
                  slot={stage.media ?? undefined}
                  placeholderLabel={`${stage.name} · Medium folgt`}
                  sizes="(min-width: 820px) 330px, 42vw"
                />
              </div>
              <div data-weg-txt="" className="vt-weg__txt">
                <Eyebrow>
                  {String(i + 1).padStart(2, '0')} / {total} · {stage.name}
                </Eyebrow>
                <h3 className="type-h3 text-balance">{stage.title}</h3>
                <p className="type-body text-fg-muted">{stage.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </JourneyMapMount>
    </Section>
  );
}
