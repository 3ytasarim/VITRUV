import { LogOut } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { logoutAction } from '@/app/admin/account-actions';
import { AccessDenied } from '@/components/auth/access-denied';
import { PortalNav } from '@/components/portal/portal-nav';
import { GlassBackdrop } from '@/components/shared/glass-backdrop';
import { buildNavigation } from '@/components/site/navigation';
import { SiteLogo } from '@/components/site/site-header';
import { Button } from '@/components/ui';
import { PORTAL_PATH } from '@/lib/auth/cookies';
import { getCurrentUser } from '@/lib/auth/session';
import { publicFontVariables } from '@/lib/fonts';
import { portalApi } from '@/lib/portal-api';
import { getPublicHome } from '@/lib/public-site';
import { pageTheme, themeCss } from '@/lib/theme';

export const metadata: Metadata = {
  title: { default: 'Mein Training', template: '%s · Mein Training · VITRUV' },
  robots: { index: false, follow: false },
};

/**
 * Client area ("Mein Training") — CLIENT accounts only (permission `training.self.read`).
 * Admin/Coach accounts are sent to the panel; the panel sends clients here. This is the UX layer:
 * every call is authorised again by the API (self context, own data only).
 * Shell (pattern of the Bleibsichtbar customer portal, rebuilt on VITRUV tokens): light sidebar
 * with the logo and navigation on desktop, a top bar with the client's initials, compact tabs on
 * phones. Same public surface, fonts and admin colour settings as the website; never indexed,
 * never cached (proxy: no-store, X-Robots-Tag).
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(PORTAL_PATH)}`);
  if (user.permissions.includes('admin.access')) redirect('/admin');
  if (!user.permissions.includes('training.self.read')) return <AccessDenied />;

  const [home, profile] = await Promise.all([getPublicHome(), portalApi.me()]);
  const logo = home.ok ? buildNavigation(home.page).logo : null;
  const theme = themeCss(home.ok ? pageTheme(home.page) : null);
  const name = profile.ok
    ? `${profile.data.firstName} ${profile.data.lastName}`.trim()
    : (user.displayName ?? '');
  const initials =
    (profile.ok
      ? `${profile.data.firstName.charAt(0)}${profile.data.lastName.charAt(0)}`
      : (user.displayName ?? user.email ?? '·').charAt(0)
    ).toUpperCase() || '·';

  const brand = (
    <Link href={PORTAL_PATH} className="vt-pshell__brand" aria-label="Mein Training – Übersicht">
      {logo && <SiteLogo logo={logo} className="vt-logo h-9 w-auto" />}
      <span className="flex flex-col leading-tight">
        <span className="vt-wordmark">VITRUV</span>
        <span className="type-caption text-fg-subtle">Mein Training</span>
      </span>
    </Link>
  );

  return (
    <div className={`vt-site vt-pshell ${publicFontVariables}`} data-surface="public" data-glass="">
      {theme && <style>{theme}</style>}
      <GlassBackdrop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Zum Inhalt springen
      </a>
      <aside className="vt-pshell__side">
        {brand}
        <PortalNav variant="sidebar" />
        <div className="vt-pshell__sidefoot">
          {profile.ok && profile.data.coach && (
            <p className="type-body-sm text-fg-muted">
              Dein Coach
              <span className="block font-semibold text-fg">{profile.data.coach.displayName}</span>
            </p>
          )}
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" icon={<LogOut aria-hidden />}>
              Abmelden
            </Button>
          </form>
        </div>
      </aside>
      <div className="vt-pshell__main">
        <header className="vt-pshell__top">
          <div className="vt-pshell__topbrand">{brand}</div>
          <div className="ml-auto flex items-center gap-3">
            <span aria-hidden className="vt-pshell__avatar">
              {initials}
            </span>
            {name && <span className="type-body-sm hidden font-semibold sm:inline">{name}</span>}
            <form action={logoutAction} className="vt-pshell__toplogout">
              <Button
                type="submit"
                variant="ghost"
                icon={<LogOut aria-hidden />}
                aria-label="Abmelden"
              />
            </form>
          </div>
        </header>
        <PortalNav variant="tabs" />
        <main id="main" tabIndex={-1} className="vt-pshell__content focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
