'use client';

import { useEffect, useRef } from 'react';

/**
 * Page background "Gravity Stars" (pattern of 21st.dev "gravity-stars" by Edu Calvo — rebuilt
 * from scratch): a fixed starfield on the lowest layer of the public site. Stars drift, twinkle,
 * connect with faint constellation lines and swirl softly toward the pointer. Content always sits
 * above it (it only shows in empty space). Star colour = the theme's text colour. Paused in
 * background tabs; a single static frame under reduced motion; fewer stars on small screens.
 */
export function GravityStars() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    type Star = { x: number; y: number; vx: number; vy: number; r: number; t: number };
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let rgb = '255,255,255';
    let frame = 0;
    let last = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const readColour = () => {
      const c = getComputedStyle(canvas).color; // = var(--color-fg) via CSS
      const m = c.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) rgb = `${m[0]},${m[1]},${m[2]}`;
    };
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(w < 640 ? 70 : 190, Math.round((w * h) / 9500));
      while (stars.length < target) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r: 0.4 + Math.random() * 1.2,
          t: Math.random() * Math.PI * 2,
        });
      }
      stars = stars.slice(0, target);
      readColour();
    };

    const LINK = 96;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      // constellation lines (short distances only)
      ctx.lineWidth = 0.6;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i]!;
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > LINK * LINK) continue;
          const alpha = (1 - Math.sqrt(d2) / LINK) * 0.16;
          ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const s of stars) {
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(s.t + now / 1400));
        ctx.fillStyle = `rgba(${rgb},${(0.25 + tw * 0.55).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (now - last < 30) return; // ~30 fps is plenty for a background
      const dt = Math.min(3, (now - last) / 16.7);
      last = now;
      for (const s of stars) {
        if (pointer.active) {
          const dx = pointer.x - s.x;
          const dy = pointer.y - s.y;
          const d = Math.hypot(dx, dy);
          if (d < 240 && d > 1) {
            const f = (1 - d / 240) * 0.035;
            // pull towards the pointer + a tangential component (swirl)
            s.vx += (dx / d) * f + (-dy / d) * f * 0.9;
            s.vy += (dy / d) * f + (dx / d) * f * 0.9;
          }
        }
        s.vx *= 0.985;
        s.vy *= 0.985;
        // keep a minimum drift so the field never freezes
        if (Math.abs(s.vx) + Math.abs(s.vy) < 0.04) {
          s.vx += (Math.random() - 0.5) * 0.02;
          s.vy += (Math.random() - 0.5) * 0.02;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < -10) s.x = w + 10;
        if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10;
        if (s.y > h + 10) s.y = -10;
      }
      draw(now);
    };

    resize();
    if (reduced) {
      draw(0);
    } else {
      frame = requestAnimationFrame(step);
    }
    const onResize = () => {
      resize();
      if (reduced) draw(0);
    };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = e.pointerType === 'mouse';
    };
    const onLeave = () => (pointer.active = false);
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reduced) {
        last = 0;
        frame = requestAnimationFrame(step);
      }
    };
    // theme colours can change (admin preview / colour settings) → re-read occasionally
    const colourTimer = window.setInterval(readColour, 4000);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(colourTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="vt-stars" />;
}
