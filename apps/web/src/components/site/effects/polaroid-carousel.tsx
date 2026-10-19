'use client';

import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { CmsMedia } from '@/components/cms/cms-media';

export type PolaroidSlide = {
  id: string;
  media: ResolvedMediaSlot;
  title?: string;
  caption?: string;
};

const AUTOPLAY_MS = 4800;
/** Fixed pseudo-random tilt per card (deterministic → identical on server and client). */
const tilt = (i: number) => [-4, 3, -2, 5, -3, 2, -5, 4][i % 8]!;

/**
 * Hanging polaroid carousel (pattern of 21st.dev "polaroid-line-carousel" by Kedhareswer Naidu,
 * MIT — rebuilt from scratch on VITRUV tokens): instant photos clipped with pegs to a sagging
 * string. Dragging slides them along the line and they swing with the drag speed, then settle.
 * Click a side photo, the arrow buttons or ←/→ to move; autoplay pauses on hover, focus, when the
 * carousel is out of view and always under reduced motion. Without JS the first photos render
 * statically on the line.
 */
export function PolaroidCarousel({
  slides,
  autoplay,
  label,
}: {
  slides: PolaroidSlide[];
  autoplay: boolean;
  label: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState<{ pos: number; swing: number } | null>(null);
  const [swing, setSwing] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const pointer = useRef<{ x: number; start: number; t: number; v: number; moved: boolean } | null>(
    null,
  );
  const count = slides.length;
  const wrap = useCallback((i: number) => ((i % count) + count) % count, [count]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(media.matches);
    const onMedia = () => setReduced(media.matches);
    media.addEventListener('change', onMedia);
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => {
      media.removeEventListener('change', onMedia);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  /** Move to a card; `direction` gives the settle swing a natural sign. */
  const go = (index: number, direction: number) => {
    setActive(wrap(index));
    if (!reduced) {
      setSwing(-direction * 7);
      window.setTimeout(() => setSwing(0), 60);
    }
  };

  // Autoplay (never under reduced motion, while dragging/hovering/focused or off-screen).
  useEffect(() => {
    if (!autoplay || reduced || paused || !visible || drag || count < 2) return;
    const timer = setTimeout(() => go(active + 1, 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  });

  // Geometry: card width follows the stage width; the string sags by `sag` px in the middle.
  const cardW = Math.max(170, Math.min(300, width * (width < 640 ? 0.56 : 0.24)));
  const spacing = cardW * (width < 640 ? 0.92 : 1.08);
  const sag = Math.min(70, width * 0.06);
  const lineTop = 26;
  const pos = drag ? drag.pos : active;
  const currentSwing = drag ? drag.swing : swing;

  /** Relative offset of card i from the current position, on a ring (shortest way round). */
  const offsetOf = (i: number) => {
    let d = i - pos;
    if (count > 2) {
      d = ((((d + count / 2) % count) + count) % count) - count / 2;
    }
    return d;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || count < 2) return;
    pointer.current = { x: event.clientX, start: active, t: performance.now(), v: 0, moved: false };
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p) return;
    const dx = event.clientX - p.x;
    if (!p.moved && Math.abs(dx) < 6) return;
    p.moved = true;
    const now = performance.now();
    const next = p.start - dx / spacing;
    const prev = drag?.pos ?? p.start;
    p.v = 0.8 * p.v + 0.2 * ((next - prev) / Math.max(1, now - p.t)) * 1000;
    p.t = now;
    setDrag({ pos: next, swing: reduced ? 0 : Math.max(-14, Math.min(14, -p.v * 6)) });
  };
  const onPointerUp = () => {
    const p = pointer.current;
    pointer.current = null;
    if (!p || !drag) return;
    const target = Math.round(drag.pos + Math.max(-1.5, Math.min(1.5, p.v * 0.25)));
    setDrag(null);
    go(target, Math.sign(p.v) || 1);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(active + 1, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(active - 1, -1);
    }
  };

  const stageH = cardW * 1.32 + sag + lineTop + 40;
  return (
    <div
      ref={root}
      className="vt-polaroids"
      role="region"
      aria-roledescription="Karussell"
      aria-label={label}
      data-dragging={drag ? 'true' : undefined}
      data-reduced={reduced || undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="vt-polaroids__stage"
        style={{ height: stageH } as CSSProperties}
        tabIndex={0}
        aria-describedby={`${id}-help`}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg
          aria-hidden
          className="vt-polaroids__line"
          viewBox={`0 0 ${Math.round(width)} ${lineTop + sag * 2}`}
          preserveAspectRatio="none"
        >
          <path
            d={`M 0 ${lineTop} Q ${width / 2} ${lineTop + sag * 2} ${width} ${lineTop}`}
            fill="none"
          />
        </svg>
        {slides.map((slide, i) => {
          const d = offsetOf(i);
          const x = d * spacing;
          const u = Math.max(0, Math.min(1, 0.5 + x / width));
          const y = lineTop + 4 * sag * u * (1 - u);
          const hidden = Math.abs(x) > width / 2 + cardW;
          const isActive = i === wrap(Math.round(pos));
          return (
            <figure
              key={slide.id}
              className="vt-polaroid"
              data-active={isActive || undefined}
              aria-hidden={!isActive || undefined}
              aria-roledescription="Foto"
              aria-label={`${i + 1} von ${count}`}
              style={
                {
                  width: cardW,
                  '--x': `${x}px`,
                  '--y': `${y}px`,
                  '--r': `${tilt(i) * (isActive ? 0.4 : 1) + currentSwing * (1 - Math.min(1, Math.abs(d) * 0.25))}deg`,
                  '--s': isActive ? 1.06 : 0.94,
                  zIndex: 100 - Math.round(Math.abs(d) * 10),
                  visibility: hidden ? 'hidden' : undefined,
                } as CSSProperties
              }
              onClick={() => {
                if (pointer.current?.moved) return;
                if (!isActive) go(i, Math.sign(d) || 1);
              }}
            >
              <span aria-hidden className="vt-polaroid__peg" />
              <span className="vt-polaroid__photo">
                <CmsMedia slot={slide.media} sizes={`${Math.round(cardW * 1.2)}px`} />
              </span>
              {(slide.title || slide.caption) && (
                <figcaption className="vt-polaroid__caption">
                  {slide.title && <span className="vt-polaroid__title">{slide.title}</span>}
                  {slide.caption && <span className="vt-polaroid__text">{slide.caption}</span>}
                </figcaption>
              )}
            </figure>
          );
        })}
      </div>
      <p id={`${id}-help`} className="sr-only">
        Mit den Pfeiltasten oder durch Ziehen blättern.
      </p>
      {count > 1 && (
        <div className="vt-polaroids__nav">
          <button
            type="button"
            className="vt-polaroids__btn"
            aria-label="Vorheriges Foto"
            onClick={() => go(active - 1, -1)}
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <span className="vt-polaroids__count" aria-live="polite">
            {String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
          </span>
          <button
            type="button"
            className="vt-polaroids__btn"
            aria-label="Nächstes Foto"
            onClick={() => go(active + 1, 1)}
          >
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
