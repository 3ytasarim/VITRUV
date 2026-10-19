'use client';

import { useEffect, useRef } from 'react';

/**
 * "Particle title" (pattern of 21st.dev "particle-title" by saki — rebuilt from scratch, matched
 * frame by frame to the original): the heading it is placed in
 *   1. DISSOLVES from the centre outwards into a glittering cloud of dust that drifts apart and
 *      fades out completely,
 *   2. is WRITTEN BACK from left to right — sparkling dust flies in at the leading edge and the
 *      finished text appears behind it,
 *   3. rests, then the loop repeats.
 * Render it INSIDE the heading element. The real text stays in the DOM (screen readers, SEO,
 * no-JS); during the effect the glyphs are hidden and the canvas draws the same text (rasterised
 * glyph by glyph at the DOM positions, with the computed font and colour of every character), so
 * the hand-over back to the real text is seamless. Off-screen, in background tabs and under
 * reduced motion nothing runs.
 */
const DISSOLVE = 1700; // text breaks from the centre outwards, dust drifts apart and fades
const GAP = 450; // empty pause
const WRITE = 1900; // left → right write-in
const FLY = 520; // flight time of a particle to its place

type P = {
  hx: number; // home position (canvas px)
  hy: number;
  ox: number; // start offset for the write-in
  oy: number;
  vx: number; // dissolve velocity
  vy: number;
  r: number;
  c: string;
  tw: number; // twinkle phase
};

export function ParticleTitle({ delay = 4200, hold = 6500 }: { delay?: number; hold?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const heading = canvas?.parentElement?.parentElement;
    if (!canvas || !heading) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: P[] = [];
    let text: HTMLCanvasElement | null = null; // the rasterised heading (device px)
    let layer: HTMLCanvasElement | null = null; // scratch layer for the dissolving text
    let dpr = 1;
    let w = 0;
    let h = 0;
    let box = { x0: 0, x1: 0, cx: 0, cy: 0, rmax: 0 }; // text bounds in css px (canvas space)
    let frame = 0;
    let timer = 0;
    let visible = false;
    let running = false;
    const PAD_X = 0.22;
    const PAD_Y = 0.7;

    /** Rasterise the heading glyph by glyph at the DOM positions and pick the dust particles. */
    const sample = () => {
      const rect = heading.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const padX = rect.width * PAD_X;
      const padY = rect.height * PAD_Y;
      w = Math.ceil(rect.width + padX * 2);
      h = Math.ceil(rect.height + padY * 2);
      Object.assign(canvas.style, {
        left: `${-padX}px`,
        top: `${-padY}px`,
        width: `${w}px`,
        height: `${h}px`,
      });
      canvas.width = Math.ceil(w * dpr);
      canvas.height = Math.ceil(h * dpr);

      text = document.createElement('canvas');
      text.width = canvas.width;
      text.height = canvas.height;
      layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const t = text.getContext('2d', { willReadFrequently: true })!;
      t.setTransform(dpr, 0, 0, dpr, 0, 0);
      t.textBaseline = 'alphabetic';
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest('[aria-hidden="true"]')) continue;
        const style = getComputedStyle(parent);
        t.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        t.fillStyle = style.color === 'rgba(0, 0, 0, 0)' ? 'white' : style.color;
        const metrics = t.measureText('Hg');
        const ascent = metrics.fontBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent;
        const value = node.textContent ?? '';
        for (const seg of new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(value)) {
          if (!seg.segment.trim()) continue;
          range.setStart(node, seg.index);
          range.setEnd(node, seg.index + seg.segment.length);
          const r = range.getBoundingClientRect();
          if (r.width === 0) continue;
          // the range box is the font's content area → baseline at its ascent share
          const baseline = r.top + (r.height * ascent) / (ascent + descent);
          const x = r.left - rect.left + padX;
          const y = baseline - rect.top + padY;
          t.fillText(seg.segment, x, y);
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x + r.width);
          y0 = Math.min(y0, r.top - rect.top + padY);
          y1 = Math.max(y1, r.bottom - rect.top + padY);
        }
      }
      if (!Number.isFinite(x0)) return false;
      box = {
        x0,
        x1,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        rmax: Math.hypot((x1 - x0) / 2, (y1 - y0) / 2) * 1.05,
      };

      // random (not grid) sampling of the glyph pixels → fine, irregular dust
      const data = t.getImageData(0, 0, text.width, text.height).data;
      const hits: number[] = [];
      const stride = Math.max(1, Math.round(dpr));
      for (let y = 0; y < text.height; y += stride) {
        for (let x = 0; x < text.width; x += stride) {
          if (data[(y * text.width + x) * 4 + 3]! > 150) hits.push(y * text.width + x);
        }
      }
      const want = Math.min(4200, hits.length);
      particles = [];
      for (let i = 0; i < want; i++) {
        const idx = hits[Math.floor(Math.random() * hits.length)]!;
        const px = (idx % text.width) / dpr + (Math.random() - 0.5) * 0.8;
        const py = Math.floor(idx / text.width) / dpr + (Math.random() - 0.5) * 0.8;
        const k = idx * 4;
        const dx = px - box.cx;
        const dy = py - box.cy;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 0.35 + Math.random() * 1.6;
        const sparkle = Math.random() < 0.07;
        particles.push({
          hx: px,
          hy: py,
          // write-in: dust arrives from a small cloud ahead of the writing edge
          ox: 18 + Math.random() * 70,
          oy: (Math.random() - 0.5) * 70,
          // dissolve: outwards from the centre, a little upwards, with scatter
          vx: (dx / dist) * speed + (Math.random() - 0.5) * 0.9,
          vy: (dy / dist) * speed * 0.8 + (Math.random() - 0.5) * 0.9 - 0.25,
          r: sparkle ? 1.6 + Math.random() * 1.4 : 0.6 + Math.random() * 0.9,
          c: `${data[k]},${data[k + 1]},${data[k + 2]}`,
          tw: Math.random() * Math.PI * 2,
        });
      }
      return true;
    };

    const dot = (p: P, x: number, y: number, a: number, now: number) => {
      if (a <= 0.01) return;
      const twinkle = 0.65 + 0.35 * Math.sin(p.tw + now / 90);
      ctx.fillStyle = `rgba(${p.c},${Math.min(1, a * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    };

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    const drawText = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(text!, 0, 0);
    };

    const finish = () => {
      // canvas shows the complete text in this frame → hand over to the real text
      clear();
      drawText();
      delete heading.dataset.dust;
      requestAnimationFrame(clear);
      running = false;
      timer = window.setTimeout(cycle, hold);
    };

    const cycle = () => {
      if (!visible || document.hidden) {
        running = false;
        return;
      }
      running = true;
      if (!sample() || !text || !layer) {
        running = false;
        return;
      }
      const lc = layer.getContext('2d')!;
      // first frame: the canvas already shows the text, then the DOM glyphs are hidden
      clear();
      drawText();
      heading.dataset.dust = 'on';
      const t0 = performance.now();

      const step = (now: number) => {
        const t = now - t0;
        clear();
        if (t < DISSOLVE) {
          // 1) dissolve: a growing hole from the centre eats the text; released dust flies apart
          const front = Math.min(1, t / (DISSOLVE * 0.55));
          const radius = front * box.rmax;
          lc.setTransform(1, 0, 0, 1, 0, 0);
          lc.clearRect(0, 0, layer!.width, layer!.height);
          lc.drawImage(text!, 0, 0);
          lc.globalCompositeOperation = 'destination-out';
          const g = lc.createRadialGradient(
            box.cx * dpr,
            box.cy * dpr,
            0,
            box.cx * dpr,
            box.cy * dpr,
            Math.max(1, radius * dpr),
          );
          g.addColorStop(0, 'rgba(0,0,0,1)');
          g.addColorStop(0.82, 'rgba(0,0,0,1)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          lc.fillStyle = g;
          lc.scale(1, 0.55); // the hole is an ellipse like the heading
          lc.fillRect(0, 0, layer!.width, layer!.height / 0.55);
          lc.setTransform(1, 0, 0, 1, 0, 0);
          lc.globalCompositeOperation = 'source-over';
          ctx.drawImage(layer!, 0, 0);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          for (const p of particles) {
            const dx = (p.hx - box.cx) / (box.rmax || 1);
            const dy = ((p.hy - box.cy) / (box.rmax || 1)) * 1.8;
            const born = Math.hypot(dx, dy) * DISSOLVE * 0.55; // when the hole reaches it
            const age = t - born;
            if (age < 0) continue;
            const k = age / 16.7;
            const ease = 1 - Math.exp(-age / 650);
            const x = p.hx + p.vx * k * (0.6 + ease);
            const y = p.hy + p.vy * k * (0.6 + ease);
            dot(p, x, y, 1 - Math.min(1, age / (DISSOLVE * 0.75)), now);
          }
          frame = requestAnimationFrame(step);
          return;
        }
        if (t < DISSOLVE + GAP) {
          frame = requestAnimationFrame(step);
          return;
        }
        const tw = t - DISSOLVE - GAP;
        if (tw < WRITE + FLY) {
          // 2) write-in from left to right
          const edge = box.x0 + Math.min(1, tw / WRITE) * (box.x1 - box.x0 + 6);
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(0, edge - 10), h);
          ctx.clip();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(text!, 0, 0);
          ctx.restore();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          for (const p of particles) {
            // a particle starts flying when the edge approaches its column
            const startAt = ((p.hx - box.x0 - 28) / (box.x1 - box.x0 + 6)) * WRITE;
            const age = tw - startAt;
            if (age < 0 || p.hx < edge - 12) continue;
            const q = Math.min(1, age / FLY);
            const e = 1 - (1 - q) ** 3;
            dot(p, p.hx + p.ox * (1 - e), p.hy + p.oy * (1 - e), Math.min(1, q * 1.6), now);
          }
          frame = requestAnimationFrame(step);
          return;
        }
        finish();
      };
      frame = requestAnimationFrame(step);
    };

    const start = (wait: number) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        void document.fonts.ready.then(cycle);
      }, wait);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !running) start(delay);
    });
    io.observe(heading);
    const onVisibility = () => {
      if (!document.hidden && visible && !running) start(1500);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      delete heading.dataset.dust;
    };
  }, [delay, hold]);

  return (
    <span aria-hidden="true" className="vt-ptitle">
      <canvas ref={canvasRef} className="vt-ptitle__canvas" />
    </span>
  );
}
