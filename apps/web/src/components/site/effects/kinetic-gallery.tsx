'use client';

import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';

export type GallerySlide = {
  id: string;
  media: ResolvedMediaSlot;
  title?: string;
  caption?: string;
};

const AUTOPLAY_MS = 4200;
const pad = (n: number) => String(n).padStart(2, '0');
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Kinetic training reel: large chamfered photo cards on a track.
 *
 * - Desktop (≥1024px, motion allowed): the section pins while the page scrolls and the track
 *   runs sideways; it leans with the scroll speed, every photo drifts inside its frame
 *   (parallax) and an outlined ghost title slides behind. Progress bar + counter follow.
 * - Mobile / tablet: native horizontal scroll-snap (swipe); optional autoplay steps forward
 *   while visible and untouched.
 * - Reduced motion: no pinning, no lean, no parallax, no autoplay — just the snap strip.
 * - Without JS: the snap strip with every photo visible.
 * All motion is written straight to CSS variables in one rAF loop (no React re-render per frame).
 */
export function KineticGallery({
  slides,
  autoplay,
  label,
  ghost,
}: {
  slides: GallerySlide[];
  autoplay: boolean;
  label: string;
  /** Large outlined word(s) behind the track. */
  ghost: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const count = slides.length;

  useEffect(() => {
    const root = wrap.current;
    const vp = viewport.current;
    const list = track.current;
    if (!root || !vp || !list) return;
    setEnhanced(true);
    const wide = window.matchMedia('(min-width: 1024px)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let mode: 'pin' | 'snap' = 'snap';
    let frame = 0;
    // true until the observer reports the reel off-screen (robust if IO reports late)
    let running = true;
    let lastX = 0;
    let lean = 0;
    let active = -1;
    let inView = true;
    let touched = false;
    let timer = 0;

    const cards = () => Array.from(list.children) as HTMLElement[];
    const setActive = (i: number) => {
      if (i === active) return;
      active = i;
      if (counter.current) counter.current.textContent = `${pad(i + 1)} / ${pad(count)}`;
      cards().forEach((card, k) => card.toggleAttribute('data-active', k === i));
    };
    // Each card's offset from the viewport centre (−1 … 1) drives the in-frame parallax.
    const drift = () => {
      const mid = vp.getBoundingClientRect().left + vp.clientWidth / 2;
      cards().forEach((card) => {
        const r = card.getBoundingClientRect();
        const d = (r.left + r.width / 2 - mid) / vp.clientWidth;
        card.style.setProperty('--p', clamp(d, -1, 1).toFixed(3));
      });
    };
    // Counter/highlight follow the progress, so the strip starts at 01 and ends at the last photo.
    const follow = (progress: number) => setActive(Math.round(progress * (count - 1)));

    const layout = () => {
      mode = wide.matches && !still.matches ? 'pin' : 'snap';
      setPinned(mode === 'pin');
      if (mode === 'pin') {
        const run = Math.max(0, list.scrollWidth - vp.clientWidth);
        root.style.height = `${run + window.innerHeight}px`;
      } else {
        root.style.height = '';
        list.style.transform = '';
      }
      tick();
    };

    const tick = () => {
      frame = 0;
      if (mode === 'pin') {
        const run = Math.max(0, list.scrollWidth - vp.clientWidth);
        const total = Math.max(1, root.offsetHeight - window.innerHeight);
        const progress = clamp(-root.getBoundingClientRect().top / total, 0, 1);
        const x = -progress * run;
        lean += (clamp((x - lastX) * 0.12, -9, 9) - lean) * 0.18;
        lastX = x;
        list.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${lean.toFixed(2)}deg)`;
        root.style.setProperty('--progress', progress.toFixed(4));
        follow(progress);
        drift();
        // keep easing the lean back to 0 after the scroll stopped
        if (Math.abs(lean) > 0.02) schedule();
      } else {
        const max = Math.max(1, list.scrollWidth - list.clientWidth);
        const progress = clamp(list.scrollLeft / max, 0, 1);
        root.style.setProperty('--progress', progress.toFixed(4));
        follow(progress);
        if (!still.matches) drift();
      }
    };
    const schedule = () => {
      if (!frame && running) frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting);
        running = inView;
        if (inView) schedule();
      },
      { rootMargin: '20% 0px' },
    );
    io.observe(root);

    // Cards wipe in once when they first enter the viewport.
    const reveal = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute('data-in', '');
            reveal.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    cards().forEach((card) => reveal.observe(card));

    const stopAuto = () => {
      touched = true;
      window.clearInterval(timer);
    };
    const startAuto = () => {
      window.clearInterval(timer);
      if (!autoplay || count < 2) return;
      timer = window.setInterval(() => {
        if (mode !== 'snap' || still.matches || touched || !inView || document.hidden) return;
        const card = cards()[0];
        const step = card ? card.offsetWidth + 16 : list.clientWidth * 0.8;
        const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 4;
        list.scrollTo({ left: atEnd ? 0 : list.scrollLeft + step, behavior: 'smooth' });
      }, AUTOPLAY_MS);
    };

    layout();
    startAuto();
    const ro = new ResizeObserver(layout);
    ro.observe(vp);
    window.addEventListener('scroll', schedule, { passive: true });
    list.addEventListener('scroll', schedule, { passive: true });
    list.addEventListener('pointerdown', stopAuto);
    list.addEventListener('focusin', stopAuto);
    wide.addEventListener('change', layout);
    still.addEventListener('change', layout);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      io.disconnect();
      reveal.disconnect();
      ro.disconnect();
      window.removeEventListener('scroll', schedule);
      list.removeEventListener('scroll', schedule);
      list.removeEventListener('pointerdown', stopAuto);
      list.removeEventListener('focusin', stopAuto);
      wide.removeEventListener('change', layout);
      still.removeEventListener('change', layout);
    };
  }, [autoplay, count]);

  /** Prev/next: scroll the page (pinned) or the strip (snap) to the neighbouring photo. */
  const step = (direction: 1 | -1) => {
    const root = wrap.current;
    const list = track.current;
    const vp = viewport.current;
    if (!root || !list || !vp) return;
    const current = Math.max(
      0,
      Array.from(list.children).findIndex((c) => c.hasAttribute('data-active')),
    );
    const target = clamp(current + direction, 0, count - 1);
    const smooth = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    if (pinned) {
      const total = root.offsetHeight - window.innerHeight;
      const top = root.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (total * target) / Math.max(1, count - 1), behavior: smooth });
    } else {
      const card = list.children[target] as HTMLElement | undefined;
      if (card) list.scrollTo({ left: card.offsetLeft - list.offsetLeft, behavior: smooth });
    }
  };

  return (
    <div
      ref={wrap}
      className="vt-reel"
      data-pinned={pinned || undefined}
      data-enhanced={enhanced || undefined}
    >
      <div ref={viewport} className="vt-reel__sticky">
        <span aria-hidden className="vt-reel__ghost">
          {ghost}
        </span>
        <ul
          ref={track}
          className="vt-reel__track"
          aria-label={label}
          tabIndex={pinned ? undefined : 0}
        >
          {slides.map((slide, i) => (
            <li
              key={slide.id}
              className="vt-chamfer vt-media vt-reel__card"
              style={{ '--i': i } as CSSProperties}
              aria-label={`${i + 1} von ${count}${slide.title ? `: ${slide.title}` : ''}`}
            >
              <span className="vt-media__clip">
                <span className="vt-reel__media">
                  <CmsMedia slot={slide.media} sizes="(min-width: 1024px) 32vw, 80vw" />
                </span>
                <span aria-hidden className="vt-reel__shade" />
              </span>
              <span aria-hidden className="vt-reel__num">
                {pad(i + 1)}
              </span>
              {(slide.title || slide.caption) && (
                <span className="vt-reel__caption">
                  {slide.title && <span className="vt-reel__title">{slide.title}</span>}
                  {slide.caption && <span className="vt-reel__text">{slide.caption}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
        {count > 1 && (
          <div className="vt-reel__hud">
            <span ref={counter} className="vt-reel__count" aria-hidden>
              {pad(1)} / {pad(count)}
            </span>
            <span aria-hidden className="vt-reel__bar">
              <span />
            </span>
            <span className="vt-reel__nav">
              <button
                type="button"
                className="vt-chamfer vt-reel__btn"
                aria-label="Vorheriges Foto"
                onClick={() => step(-1)}
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
              <button
                type="button"
                className="vt-chamfer vt-reel__btn"
                aria-label="Nächstes Foto"
                onClick={() => step(1)}
              >
                <ArrowRight aria-hidden className="size-5" />
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
