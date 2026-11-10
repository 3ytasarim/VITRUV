'use client';

import { useEffect, useRef, type CSSProperties } from 'react';

/**
 * Light running around a card's frame — port of the MIT "Border Beam" (21st.dev, @badtzx0),
 * frame part only, in the site blue. A radial glow follows the element's outline (CSS
 * offset-path, set from the measured size) and is masked to the border ring, so only the frame
 * lights up. Pure CSS animation (no motion library); stands still / hidden with
 * prefers-reduced-motion. Decorative (aria-hidden). The parent needs position: relative.
 */
export function BorderBeam({
  seconds = 10,
  delay = 0,
  size = 200,
  width = 1,
}: {
  /** Duration of one round. */
  seconds?: number;
  /** Start offset (seconds) so several cards do not run in step. */
  delay?: number;
  /** Diameter of the light. */
  size?: number;
  /** Frame width in px. */
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      el.style.setProperty(
        '--bb-path',
        `path("M 0 0 H ${el.offsetWidth} V ${el.offsetHeight} H 0 V 0")`,
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="bb"
      style={
        {
          '--bb-duration': `${seconds}s`,
          '--bb-delay': `${-delay}s`,
          '--bb-size': `${size}px`,
          '--bb-width': `${width}px`,
        } as CSSProperties
      }
    >
      <div className="bb__light" />
    </div>
  );
}
