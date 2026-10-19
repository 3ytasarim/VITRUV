import { RevealGroup, RevealWords, Section, SectionIntro } from '@/components/ui';
import { HighlightedTitle } from '../highlighted-title';
import type { SectionProps } from '../section-props';
import { SituationsExplorer } from './situations-explorer';

/**
 * "Lebenssituationen" — typical starting points as an interactive list → stage explorer
 * (SituationsExplorer), with the CMS closing line as an invitation underneath.
 */
export function SituationsSection({ content, id }: SectionProps<'situations'>) {
  const titleId = `${id}-title`;
  return (
    <Section id={id} labelledBy={titleId} className="vt-situations">
      <SectionIntro
        eyebrow={content.eyebrow}
        title={<HighlightedTitle title={content.title} highlight={content.highlight} />}
        lead={content.intro}
        titleId={titleId}
      />
      {content.items.length > 0 && (
        <div className="mt-14 md:mt-20">
          <SituationsExplorer items={content.items} />
        </div>
      )}
      {content.outro && (
        <RevealGroup className="vt-outro">
          <span aria-hidden className="vt-outro__mark">
            “
          </span>
          <p className="vt-outro__text">
            <RevealWords text={content.outro} />
          </p>
          <span aria-hidden className="vt-outro__rule" />
        </RevealGroup>
      )}
    </Section>
  );
}
