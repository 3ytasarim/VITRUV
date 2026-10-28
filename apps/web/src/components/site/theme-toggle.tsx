'use client';

import { useEffect, useState } from 'react';
import { THEME_CHANGE_EVENT, THEME_COOKIE, type ThemeMode } from './theme-mode';

const YEAR = 60 * 60 * 24 * 365;

/**
 * Light/dark switch at the right end of the header (reference: half-filled circle + the name of
 * the OTHER mode, "Hell" / "Dunkel"). Switches `data-theme` on the site root, remembers the choice
 * in a preference cookie and tells interested components (Journey map) to redraw.
 */
export function ThemeToggle({
  initial,
  className = 'vf-theme',
}: {
  initial: ThemeMode;
  className?: string;
}) {
  const [mode, setMode] = useState<ThemeMode>(initial);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.vt-site');
    if (!root) return;
    if (mode === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
  }, [mode]);

  const toggle = () => {
    const next: ThemeMode = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${YEAR}; samesite=lax`;
    // after React applied the attribute (effect above) — the next frame sees the new colours
    requestAnimationFrame(() => window.dispatchEvent(new Event(THEME_CHANGE_EVENT)));
  };

  const target = mode === 'light' ? 'Dunkel' : 'Hell';
  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={mode === 'light' ? 'Zur dunklen Version' : 'Zur hellen Version'}
      title={mode === 'light' ? 'Zur dunklen Version' : 'Zur hellen Version'}
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
      </svg>
      <span>{target}</span>
    </button>
  );
}
