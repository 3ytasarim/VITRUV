'use client';

import { useEffect, useRef } from 'react';

/**
 * Interactive starfield behind the packages (pattern of the 21st.dev "pricing" block by
 * ravikatiyar162, rebuilt without framer-motion): twinkling dots that are pulled softly towards
 * the pointer within a radius and spring back when it leaves. Positions are seeded, so server
 * and client render the same markup. Decorative only (aria-hidden); static under reduced motion.
 */
const STAR_COUNT = 110;
const RADIUS = 520;
const PULL = 0.45;
/** Per-frame easing towards the target offset (spring-like follow). */
const FOLLOW = 0.12;

/** Small deterministic PRNG (mulberry32) — identical stars on server and client. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seeded(20261118);
const STARS = Array.from({ length: STAR_COUNT }, () => ({
  top: random() * 100,
  left: random() * 100,
  size: 1 + random() * 2,
  duration: 2 + random() * 3,
  delay: random() * 5,
}));

export function PricingStarfield() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = ref.current;
    const host = field?.parentElement;
    if (!field || !host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const nodes = Array.from(field.children) as HTMLElement[];
    const offsets = nodes.map(() => ({ x: 0, y: 0, tx: 0, ty: 0 }));
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    const tick = () => {
      frame = 0;
      const rect = field.getBoundingClientRect();
      let moving = false;
      nodes.forEach((node, i) => {
        const star = STARS[i];
        const o = offsets[i];
        if (!star || !o) return;
        if (pointer) {
          const dx = pointer.x - (rect.left + (star.left / 100) * rect.width);
          const dy = pointer.y - (rect.top + (star.top / 100) * rect.height);
          const distance = Math.hypot(dx, dy);
          const force = distance < RADIUS ? (1 - distance / RADIUS) * PULL : 0;
          o.tx = dx * force;
          o.ty = dy * force;
        } else {
          o.tx = 0;
          o.ty = 0;
        }
        o.x += (o.tx - o.x) * FOLLOW;
        o.y += (o.ty - o.y) * FOLLOW;
        if (Math.abs(o.tx - o.x) > 0.1 || Math.abs(o.ty - o.y) > 0.1) moving = true;
        node.style.translate = `${o.x.toFixed(1)}px ${o.y.toFixed(1)}px`;
      });
      if (moving) frame = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      pointer = null;
      schedule();
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className="r-starfield" aria-hidden>
      {STARS.map((star, i) => (
        <span
          key={i}
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
