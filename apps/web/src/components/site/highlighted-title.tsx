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
