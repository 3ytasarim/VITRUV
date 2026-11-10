'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** Splits a sentence so the given phrases ("a / b") are wrapped in a glowing span. */
function withGlow(text: string, highlight?: string): ReactNode {
  const phrases = (highlight ?? '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  const hits: { at: number; len: number }[] = [];
  for (const phrase of phrases) {
    const at = text.indexOf(phrase);
    if (at >= 0 && !hits.some((h) => at < h.at + h.len && h.at < at + phrase.length)) {
      hits.push({ at, len: phrase.length });
    }
  }
  if (hits.length === 0) return text;
  hits.sort((a, b) => a.at - b.at);
  const out: ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, i) => {
    if (h.at > pos) out.push(text.slice(pos, h.at));
    out.push(
      <span key={i} className="vm-glow">
        {text.slice(h.at, h.at + h.len)}
      </span>,
    );
    pos = h.at + h.len;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/**
 * Vertical text marquee of the "CTA with Text Marquee" block (21st.dev, @lyanchouss): the lines
 * run upwards in two copies, each line fades with its distance from the vertical centre, and
 * top/bottom vignettes melt them into the background. The copy is aria-hidden + inert; with
 * prefers-reduced-motion it stands still (CSS) and the opacity loop does not run.
 */
export function VerticalMarquee({
  items,
  seconds = 20,
  className,
}: {
  items: { id: string; text: string; highlight?: string }[];
  seconds?: number;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let visible = false;
    const update = () => {
      frame = 0;
      if (!visible) return;
      const rect = el.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      const max = rect.height / 2 || 1;
      el.querySelectorAll<HTMLElement>('.vm-item').forEach((item) => {
        const r = item.getBoundingClientRect();
        const d = Math.min(Math.abs(centre - (r.top + r.height / 2)) / max, 1);
        item.style.opacity = String(1 - d * 0.75);
      });
      frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !frame) frame = requestAnimationFrame(update);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const list = items.map((item) => (
    <p key={item.id} className="vm-item">
      {withGlow(item.text, item.highlight)}
    </p>
  ));
  return (
    <div
      ref={box}
      className={className ? `vm ${className}` : 'vm'}
      style={{ '--vm-dur': `${seconds}s` } as CSSProperties}
    >
      <div className="vm-track">
        <div className="vm-group">{list}</div>
        <div className="vm-group" aria-hidden inert>
          {list}
        </div>
      </div>
      <div aria-hidden className="vm-vignette vm-vignette--top" />
      <div aria-hidden className="vm-vignette vm-vignette--bottom" />
    </div>
  );
}
