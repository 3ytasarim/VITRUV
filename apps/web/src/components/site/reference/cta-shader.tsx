'use client';

import { NeuroNoise } from '@paper-design/shaders-react';
import { useEffect, useRef, useState } from 'react';

type Colours = { front: string; mid: string; back: string };

/** `--r-*-rgb` triplet of the current theme → `rgb(r, g, b)` for the shader. */
function rgbVar(el: Element, name: string, alpha = 1): string | null {
  const parts = getComputedStyle(el)
    .getPropertyValue(name)
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return parts.length >= 3 ? `rgba(${parts.slice(0, 3).join(', ')}, ${alpha})` : null;
}

/**
 * Animated "neuro noise" WebGL shader behind the closing CTA (owner request 2026-11-09, after the
 * 21st.dev "CTA Section with Noise Shader"). Colours come from the site palette — light lines,
 * the site blue as mid tone, the page background behind — so nothing is hardcoded and the theme
 * switch is followed. Stands still with `prefers-reduced-motion`; decorative (aria-hidden).
 */
export function CtaShader({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [colours, setColours] = useState<Colours | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const front = rgbVar(el, '--r-fg-rgb');
      const mid = rgbVar(el, '--r-glow-rgb', 0.85);
      const back = rgbVar(el, '--r-bg-rgb');
      if (front && mid && back) setColours({ front, mid, back });
    };
    read();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(motion.matches);
    const onMotion = () => setStill(motion.matches);
    motion.addEventListener('change', onMotion);
    window.addEventListener('vt-theme-change', read);
    return () => {
      motion.removeEventListener('change', onMotion);
      window.removeEventListener('vt-theme-change', read);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className={className}>
      {colours && (
        <NeuroNoise
          colorFront={colours.front}
          colorMid={colours.mid}
          colorBack={colours.back}
          brightness={0}
          contrast={1}
          scale={0.55}
          speed={still ? 0 : 1}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
}
