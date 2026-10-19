import { RevealWords } from '@/components/ui';

/** Splits a title around the CMS "highlight" phrase (if it occurs in the title). */
export function splitHighlight(title: string, highlight?: string) {
  const index = highlight ? title.indexOf(highlight) : -1;
  if (!highlight || index < 0) return { before: title, highlight: '', after: '' };
  return {
    before: title.slice(0, index),
    highlight,
    after: title.slice(index + highlight.length),
  };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Title with the CMS highlight set in the gold Bodoni italic accent ('Greek Harmony'). Words are
 * masked for the staggered reveal of SectionIntro (one running index across all three parts).
 */
export function HighlightedTitle({ title, highlight }: { title: string; highlight?: string }) {
  const parts = splitHighlight(title, highlight);
  const afterBefore = wordCount(parts.before);
  return (
    <>
      <RevealWords text={parts.before} />
      {parts.highlight && (
        <em className="vt-em">
          <RevealWords text={parts.highlight} start={afterBefore} />
        </em>
      )}
      <RevealWords text={parts.after} start={afterBefore + wordCount(parts.highlight)} />
    </>
  );
}
