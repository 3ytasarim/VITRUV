import { ExternalLink, LogOut } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getImageProps } from 'next/image';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/admin/account-actions';
import { AdminShell } from '@/components/admin/admin-shell';
import { ADMIN_THEME_COOKIE, parseAdminThemeMode } from '@/components/admin/admin-theme-mode';
import { AdminThemeToggle } from '@/components/admin/admin-theme-toggle';
import { Button } from '@/components/ui';
import { requireAdminUser } from '@/lib/auth/session';
import { publicFontVariables } from '@/lib/fonts';
import { getPublicHome } from '@/lib/public-site';
import { adminLightCss } from '@/lib/theme';

const ROLE_LABEL = { ADMIN: 'Admin', COACH: 'Coach', CLIENT: 'Kund:in' } as const;

/**
 * Coach/Admin shell: glass panels on plain black (data-glass, owner decision 2026-10-19 — no
 * faceted backdrop in the admin; admin type scale from [data-surface='admin']), navigation
 * + the signed-in account (link to "Konto & Sicherheit", logout). Access is already enforced by
 * the admin root layout and, for every data call, by the API.
 */
export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const { user } = await requireAdminUser();
  const name = user.displayName ?? user.email ?? 'Konto';
  // Light/dark switch in the top bar (preference cookie; dark glass by default).
  const mode = parseAdminThemeMode((await cookies()).get(ADMIN_THEME_COOKIE)?.value);
  // round logo from the CMS page settings for the collapsed sidebar
  const home = await getPublicHome();
  const seo = home.ok ? home.page.sections.find((s) => s.type === 'seo') : undefined;
  const logo = seo?.type === 'seo' ? seo.content.logo : null;
  const logoSrc = logo
    ? getImageProps({ src: logo.desktop.url, alt: '', width: 64, height: 64, quality: 90 }).props
        .src
    : null;
  return (
    <div
      className={publicFontVariables}
      data-surface="admin"
      data-glass=""
      data-admin-theme={mode === 'light' ? 'light' : undefined}
    >
      <style>{adminLightCss()}</style>
      <AdminShell
        permissions={user.permissions}
        logoSrc={logoSrc}
        headerEnd={
          <>
            <AdminThemeToggle initial={mode} />
            <span className="type-body-sm hidden text-fg-muted lg:inline">
              {new Intl.DateTimeFormat('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'Europe/Berlin',
              }).format(new Date())}
            </span>
            <Link
              href="/"
              target="_blank"
              className="vt-icon-btn"
              aria-label="Website öffnen (neuer Tab)"
            >
              <ExternalLink aria-hidden className="size-4" />
            </Link>
            <Link href="/admin/konto" className="vt-admin__avatar" aria-label="Konto & Sicherheit">
              {name.slice(0, 1).toUpperCase()}
            </Link>
          </>
        }
        account={
          <Link
            href="/admin/konto"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 text-fg-muted hover:text-fg"
          >
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-pill bg-surface-sunken type-body-sm font-medium text-fg"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="type-body-sm block truncate text-fg">{name}</span>
              <span className="type-caption text-fg-subtle">{ROLE_LABEL[user.role]}</span>
            </span>
          </Link>
        }
        logout={
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" icon={<LogOut aria-hidden />}>
              <span className="vt-admin__logout-label">Abmelden</span>
            </Button>
          </form>
        }
      >
        {children}
      </AdminShell>
    </div>
  );
}
