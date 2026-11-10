/**
 * Visitor's colour mode of the public site (header toggle): dark = reference "Website
 * Funktional", light = reference "Funktional Hell" (token light variant). Kept in a
 * first-party preference cookie, so the server renders the chosen mode directly (no flash, no
 * inline script). Functional preference — no consent needed.
 */
export type ThemeMode = 'dark' | 'light';

export const THEME_COOKIE = 'vt-theme';

/** Event fired on window after the mode changed (e.g. the Journey map redraws its colours). */
export const THEME_CHANGE_EVENT = 'vt-theme-change';

/**
 * Owner decision 2026-11-09: the site opens dark ("Dunkel") and the header switch is hidden for
 * now (kept, not deleted — set to `true` to offer it again). While it is hidden every visitor
 * sees the default mode; an older preference cookie is ignored so nobody is stuck in a
 * mode they cannot leave.
 */
export const SHOW_THEME_TOGGLE = false;

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  if (!SHOW_THEME_TOGGLE) return DEFAULT_THEME_MODE;
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME_MODE;
}
