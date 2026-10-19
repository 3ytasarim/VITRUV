'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Publishes the pointer position to its children as CSS variables — one listener for a whole
 * group of cards (patterns adapted from the Meridius "spotlight-card" GlowCard and the
 * "animated-3d-card" tilt, re-built without libraries):
 *   - every `[data-pointer]` child gets --px / --py (pointer in px, relative to that child) for a
 *     cursor spotlight, and --rx / --ry (−1…1) for a tilt;
 *   - fine pointers only (no effect on touch), nothing at all under prefers-reduced-motion.
 * Purely visual: the content is complete without it.
 */
export function PointerField({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      if (!last) return;
      for (const card of root.querySelectorAll<HTMLElement>('[data-pointer]')) {
        const box = card.getBoundingClientRect();
        const x = last.clientX - box.left;
        const y = last.clientY - box.top;
        card.style.setProperty('--px', `${x}px`);
        card.style.setProperty('--py', `${y}px`);
        const inside = x >= 0 && y >= 0 && x <= box.width && y <= box.height;
        card.style.setProperty('--rx', inside ? ((x / box.width) * 2 - 1).toFixed(3) : '0');
        card.style.setProperty('--ry', inside ? ((y / box.height) * 2 - 1).toFixed(3) : '0');
      }
    };
    const move = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      for (const card of root.querySelectorAll<HTMLElement>('[data-pointer]')) {
        card.style.setProperty('--rx', '0');
        card.style.setProperty('--ry', '0');
      }
    };
    root.setAttribute('data-pointer-live', '');
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerleave', leave);
    return () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <Tag ref={ref} className={cx(className)}>
      {children}
    </Tag>
  );
}
