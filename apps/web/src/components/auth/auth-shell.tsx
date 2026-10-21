import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { getImageProps } from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GravityStars } from '@/components/site/effects/gravity-stars';
import { buildNavigation } from '@/components/site/navigation';
import { publicFontVariables } from '@/lib/fonts';
import { getPublicHome } from '@/lib/public-site';
import { pageTheme, themeCss } from '@/lib/theme';

/**
 * Shared frame for every account page (login, activation, access denied, disabled account) —
 * one centred card on the website's own background (CMS colours "Farben & Design", starfield),
 * like a classic product sign-in: logo on top (CMS logo, used unchanged; on dark backgrounds the
 * theme inverts it to white), then the page content, then a small footer line.
 */
export async function AuthShell({
  children,
  logo,
}: {
  children: ReactNode;
  /** Overrides the CMS logo (tests). */
  logo?: ResolvedMediaSlot | null;
}) {
  const home = await getPublicHome();
  const theme = themeCss(home.ok ? pageTheme(home.page) : null);
  const brand = logo !== undefined ? logo : home.ok ? buildNavigation(home.page).logo : null;
  const logoImg = brand
    ? getImageProps({
        src: brand.desktop.url,
        alt: 'VITRUV – zur Startseite',
        width: 240,
        height:
          brand.desktop.width && brand.desktop.height
            ? Math.round((240 * brand.desktop.height) / brand.desktop.width)
            : 240,
        quality: 90,
        priority: true,
      }).props
    : null;
  return (
    <div className={`vt-site ${publicFontVariables}`} data-surface="public">
      {theme && <style>{theme}</style>}
      <GravityStars />
      <main id="main" className="vt-auth">
        <span aria-hidden className="vt-auth__glow" />
        <div className="vt-auth__card vt-rise">
          <Link href="/" className="vt-auth__brand">
            {logoImg ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- alt is set via getImageProps
              <img {...logoImg} className="vt-auth__logo" />
            ) : (
              <span className="vt-wordmark">VITRUV</span>
            )}
          </Link>
          <div className="vt-auth__content">{children}</div>
        </div>
        <p className="vt-auth__foot type-caption">© VITRUV Coaching</p>
      </main>
    </div>
  );
}

/** The published CMS logo for account pages (cached public content; null when unavailable). */
export async function authLogo(): Promise<ResolvedMediaSlot | null> {
  const home = await getPublicHome();
  return home.ok ? buildNavigation(home.page).logo : null;
}
