'use client';

import { useEffect, useRef } from 'react';

type Star = {
  /** Position as a fraction of the box (0..1). */
  fx: number;
  fy: number;
  /** Dot diameter in CSS px (1..3). */
  size: number;
  /** One twinkle (0 → 1 → 0) in seconds, and its start delay. */
  period: number;
  delay: number;
  /** Spring state of the pointer pull (offset + velocity, CSS px). */
  x: number;
  y: number;
  vx: number;
  vy: number;
};

/** Pull radius and strength, spring constants — same feel as the reference starfield. */
const RADIUS = 600;
const PULL = 0.5;
const STIFFNESS = 100;
const DAMPING = 15;
const MASS = 0.1;

function makeStars(count: number): Star[] {
  return Array.from({ length: count }, () => ({
    fx: Math.random(),
    fy: Math.random(),
    size: 1 + Math.random() * 2,
    period: 2 + Math.random() * 3,
    delay: Math.random() * 5,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }));
}

function fgRgb(el: Element): string {
  const parts = getComputedStyle(el)
    .getPropertyValue('--r-fg-rgb')
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return parts.length >= 3 ? parts.slice(0, 3).join(', ') : '255, 255, 255';
}

/**
 * Interactive starfield behind the package cards (owner request 2026-11-24, after the background
 * of the 21st.dev "Pricing" section by ravikatiyar162): ~150 twinkling dots in the site's text
 * colour that lean towards the pointer within 600px and spring back. One canvas instead of 150
 * animated elements; the loop only runs while the section is on screen. With
 * `prefers-reduced-motion` the stars are drawn once, still. Decorative (aria-hidden).
 */
export function StarField({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;
    // the pointer is tracked on the section the field sits in (the field itself ignores pointers)
    const host = wrap.parentElement ?? wrap;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let colour = fgRgb(wrap);
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    let visible = false;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      const box = wrap.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 150 on a desktop section, fewer on a phone (same density)
      const count = Math.round(Math.min(150, Math.max(60, (width * height) / 7000)));
      if (stars.length !== count) stars = makeStars(count);
      if (still) draw(0);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        let alpha = 0.6;
        if (!still) {
          const t = time - s.delay;
          alpha = t < 0 ? 0 : Math.sin(Math.PI * ((t % s.period) / s.period));
        }
        if (alpha <= 0.01) continue;
        ctx.fillStyle = `rgba(${colour}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.fx * width + s.x, s.fy * height + s.y, s.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (dt: number) => {
      for (const s of stars) {
        let tx = 0;
        let ty = 0;
        if (pointer) {
          const dx = pointer.x - s.fx * width;
          const dy = pointer.y - s.fy * height;
          const d = Math.hypot(dx, dy);
          if (d < RADIUS) {
            const k = (1 - d / RADIUS) * PULL;
            tx = dx * k;
            ty = dy * k;
          }
        }
        s.vx += ((-STIFFNESS * (s.x - tx) - DAMPING * s.vx) / MASS) * dt;
        s.vy += ((-STIFFNESS * (s.y - ty) - DAMPING * s.vy) / MASS) * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      // small fixed sub-steps keep the stiff spring stable on slow frames
      let dt = Math.min((now - (last || now)) / 1000, 1 / 20);
      last = now;
      while (dt > 0) {
        const h = Math.min(dt, 1 / 120);
        step(h);
        dt -= h;
      }
      draw((now - start) / 1000);
    };

    const play = () => {
      if (still || frame || !visible) return;
      last = 0;
      frame = requestAnimationFrame(loop);
    };
    const pause = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const onMove = (e: PointerEvent) => {
      const box = wrap.getBoundingClientRect();
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const onLeave = () => {
      pointer = null;
    };
    const onTheme = () => {
      colour = fgRgb(wrap);
      if (still) draw(0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (visible) play();
      else pause();
    });
    io.observe(wrap);
    if (!still) {
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerleave', onLeave);
    }
    window.addEventListener('vt-theme-change', onTheme);

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('vt-theme-change', onTheme);
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className={className}>
      <canvas ref={canvasRef} className="r-stars__canvas" />
    </div>
  );
}
