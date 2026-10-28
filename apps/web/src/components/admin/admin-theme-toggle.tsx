'use client';

import { useState } from 'react';
import { ADMIN_THEME_COOKIE, type AdminThemeMode } from './admin-theme-mode';

const YEAR = 60 * 60 * 24 * 365;

/**
 * Light/dark switch in the admin top bar (same icon + wording as the website header: it names
 * the OTHER mode). Sets `data-admin-theme` on the admin shell root and remembers the choice in a
 * preference cookie, so the server renders the chosen mode directly.
 */
export function AdminThemeToggle({ initial }: { initial: AdminThemeMode }) {
  const [mode, setMode] = useState<AdminThemeMode>(initial);
  const toggle = () => {
    const next: AdminThemeMode = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    const root = document.querySelector<HTMLElement>("[data-surface='admin'][data-glass]");
    if (next === 'light') root?.setAttribute('data-admin-theme', 'light');
    else root?.removeAttribute('data-admin-theme');
    document.cookie = `${ADMIN_THEME_COOKIE}=${next}; path=/admin; max-age=${YEAR}; samesite=lax`;
  };
  const label = mode === 'light' ? 'Zur dunklen Ansicht' : 'Zur hellen Ansicht';
  return (
    <button
      type="button"
      className="vt-admin-theme"
      onClick={toggle}
      aria-label={label}
      title={label}
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
      <span>{mode === 'light' ? 'Dunkel' : 'Hell'}</span>
    </button>
  );
}
