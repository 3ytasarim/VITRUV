'use client';

import { useEffect } from 'react';
import { isAnalyticsEvent, track } from '@/lib/analytics';

/**
 * One delegated click listener for the whole public site: links/buttons declare their event
 * with `data-track="cta_click" data-track-section="hero" data-track-label="…"` in server-rendered
 * HTML, so no section needs its own client boundary. A no-op while no adapter/consent exists.
 */
export function AnalyticsBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-track]');
      const name = target?.dataset.track;
      if (!target || !isAnalyticsEvent(name)) return;
      track(name, { section: target.dataset.trackSection, label: target.dataset.trackLabel });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return null;
}
