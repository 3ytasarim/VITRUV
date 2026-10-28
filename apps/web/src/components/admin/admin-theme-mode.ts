/** Preference cookie of the admin light/dark mode (first-party, functional; server + client). */
export const ADMIN_THEME_COOKIE = 'vt-admin-theme';
export type AdminThemeMode = 'dark' | 'light';

export function parseAdminThemeMode(value: string | undefined | null): AdminThemeMode {
  return value === 'light' ? 'light' : 'dark';
}
