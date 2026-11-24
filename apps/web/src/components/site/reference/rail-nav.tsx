'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * Prev/next buttons above the results rail (owner 2026-11-24: the "Wischen →" hint looked like a
 * button but did nothing). Scrolls the rail by one card; "next" at the end jumps back to the
 * start. Swiping still works as before. The CMS hint text stays the label of the next button.
 */
export function RailNav({ railId, label }: { railId: string; label: string }) {
  const step = (dir: 1 | -1) => {
    const rail = document.getElementById(railId);
    if (!rail) return;
    const item = rail.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
    const by = (item?.offsetWidth ?? rail.clientWidth * 0.8) + gap;
    const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
    if (dir === 1 && atEnd) rail.scrollTo({ left: 0, behavior });
    else rail.scrollBy({ left: dir * by, behavior });
  };
  const text = label.replace(/\s*[→>]+\s*$/, '');
  return (
    <div className="r-swipe">
      <button
        type="button"
        className="r-swipe__btn r-swipe__btn--prev"
        aria-controls={railId}
        aria-label="Vorherige Bilder"
        onClick={() => step(-1)}
      >
        <ArrowLeft aria-hidden size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="r-swipe__btn"
        aria-controls={railId}
        aria-label={`${text}: nächste Bilder`}
        onClick={() => step(1)}
      >
        <span>{text}</span>
        <ArrowRight aria-hidden size={16} strokeWidth={2} />
      </button>
    </div>
  );
}
