'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Step = { id: string; title: string; text: string };

const nn = (i: number) => String(i + 1).padStart(2, '0');

/**
 * "So läuft es ab" as the horizontal scroll timeline of the 21st.dev "Timeline" (@hyperiux),
 * ported without GSAP: the section pins (sticky) while the page scrolls, the track slides left,
 * a glowing site-blue line fills along it and the steps open one after another — alternating
 * above and below the line (stem grows, dot pops, text rises out of a mask). The leading image of
 * the original is an empty frame like the other empty media frames of the page.
 * prefers-reduced-motion: no pinning, a plain horizontally scrollable row with everything shown.
 */
export function StepTimeline({
  title,
  eyebrow,
  steps,
  titleId,
}: {
  title: string;
  eyebrow?: string;
  steps: Step[];
  titleId: string;
}) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setStill(motion.matches);
    sync();
    motion.addEventListener('change', sync);
    return () => motion.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const sec = section.current;
    const row = track.current;
    if (!sec || !row || still) return;
    const items = [...row.querySelectorAll<HTMLElement>('[data-tl-item]')];
    let overflow = 0;
    let frame = 0;

    const measure = () => {
      overflow = Math.max(0, row.scrollWidth - window.innerWidth);
      sec.style.setProperty('--tl-scroll', `${overflow}px`);
    };
    const update = () => {
      frame = 0;
      const rect = sec.getBoundingClientRect();
      const total = sec.offsetHeight - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      row.style.transform = `translate3d(${-p * overflow}px, 0, 0)`;
      sec.style.setProperty('--tl-progress', String(Math.min(1, p * 1.08)));
      const reveal = window.innerWidth * 0.78;
      for (const item of items) {
        const on = item.getBoundingClientRect().left < reveal;
        if (on !== item.hasAttribute('data-on')) item.toggleAttribute('data-on', on);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    measure();
    update();
    const ro = new ResizeObserver(() => {
      measure();
      schedule();
    });
    ro.observe(row);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      row.style.transform = '';
    };
  }, [still, steps.length]);

  return (
    <section
      ref={section}
      id="ablauf"
      className="tl"
      data-still={still ? '' : undefined}
      aria-labelledby={titleId}
      style={{ '--tl-count': steps.length } as CSSProperties}
    >
      <div className="tl-pin">
        <div ref={track} className="tl-track">
          <div aria-hidden className="r-slot tl-frame" />
          <div className="tl-area">
            <div className="tl-head">
              {eyebrow && <span className="r-eyebrow">{eyebrow}</span>}
              <h2 id={titleId} className="tl-title">
                {title}
              </h2>
            </div>
            <div aria-hidden className="tl-line">
              <span className="tl-line__dot" />
              <span className="tl-line__fill" />
              <span className="tl-line__dot tl-line__dot--end" />
            </div>
            <ol className="tl-steps">
              {steps.map((s, i) => (
                <li
                  key={s.id}
                  className="tl-step"
                  data-tl-item=""
                  data-side={i % 2 === 0 ? 'top' : 'bottom'}
                  data-on={still ? '' : undefined}
                  style={{ '--tl-i': i } as CSSProperties}
                >
                  <span aria-hidden className="tl-step__stem" />
                  <span aria-hidden className="tl-step__dot" />
                  <div className="tl-step__copy">
                    <span className="tl-mask">
                      <span className="tl-step__no">{nn(i)}</span>
                    </span>
                    <span className="tl-mask">
                      <h3 className="tl-step__title">{s.title}</h3>
                    </span>
                    <span className="tl-mask">
                      <p className="tl-step__text">{s.text}</p>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
