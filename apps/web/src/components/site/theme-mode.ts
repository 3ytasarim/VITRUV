/**
 * Visitor's colour mode of the public site (header toggle). Owner decision 2026-10-27: the site
 * opens dark like the reference "Website Funktional" (published CMS theme); "Hell" switches to
 * the light reference "Funktional Hell" (token light variant, `lightModeCss`). Kept in a
 * first-party preference cookie, so the server renders the chosen mode directly (no flash, no
 * inline script). Functional preference — no consent needed.
 */
export type ThemeMode = 'dark' | 'light';

export const THEME_COOKIE = 'vt-theme';

/** Event fired on window after the mode changed (e.g. the Journey map redraws its colours). */
export const THEME_CHANGE_EVENT = 'vt-theme-change';

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return value === 'light' ? 'light' : 'dark';
}
