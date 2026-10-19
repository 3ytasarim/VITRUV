'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * Plays a CSS entrance once the group scrolls into view: sets data-armed on mount (CSS may then
 * hide the parts) and data-inview when it is visible. Without JavaScript neither attribute is
 * set, so everything is simply visible; reduced motion is handled in CSS.
 */
export function RevealGroup({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute('data-armed', '');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.setAttribute('data-inview', '');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx(className)}>
      {children}
    </div>
  );
}
