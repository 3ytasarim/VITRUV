'use client';

import { useEffect, useRef } from 'react';

/**
 * Header behaviour (CSS does the visuals):
 *  - data-scrolled="true"  once the page has scrolled (over the hero stage: once the hero copy
 *    has scrolled away) → solid glass pill;
 *  - data-hidden="true"    while reading downwards past the first screen → pill slides away,
 *    back on the first scroll up (never hidden while a link inside has keyboard focus);
 *  - data-active on the navigation link whose section is in view (scrollspy).
 * Renders an empty, hidden marker element.
 */
export function HeaderScrollState() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = ref.current?.closest('header');
    if (!header) return;
    const stage = header.hasAttribute('data-over-hero')
      ? document.querySelector<HTMLElement>('[data-hero-media]')
      : null;
    const threshold = () =>
      stage ? Math.max(8, stage.offsetHeight * 0.55 - header.offsetHeight) : 8;

    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      header.setAttribute('data-scrolled', String(y > threshold()));
      const down = y > lastY + 4;
      const up = y < lastY - 4;
      const focused = header.contains(document.activeElement);
      if (down && y > window.innerHeight * 0.6 && !focused)
        header.setAttribute('data-hidden', 'true');
      else if (up || y < 80) header.removeAttribute('data-hidden');
      if (Math.abs(y - lastY) > 4) lastY = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocus = () => header.removeAttribute('data-hidden');
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    header.addEventListener('focusin', onFocus);

    // Scrollspy: in-page anchors of the navigation → their sections.
    const links = [...header.querySelectorAll<HTMLAnchorElement>('.vt-navlink')];
    const byId = new Map<string, HTMLAnchorElement>();
    for (const link of links) {
      const match = /^\/?#([\w-]+)$/.exec(link.getAttribute('href') ?? '');
      if (match?.[1]) byId.set(match[1], link);
    }
    const sections = [...byId.keys()]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const link of links) link.removeAttribute('data-active');
          byId.get(entry.target.id)?.setAttribute('data-active', '');
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    sections.forEach((section) => spy.observe(section));

    return () => {
      window.removeEventListener('scroll', onScroll);
      header.removeEventListener('focusin', onFocus);
      if (frame) cancelAnimationFrame(frame);
      spy.disconnect();
    };
  }, []);
  return <span ref={ref} hidden />;
}
