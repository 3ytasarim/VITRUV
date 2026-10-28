import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { getImageProps } from 'next/image';
import Link from 'next/link';
import { HeaderScrollState } from './header-scroll-state';
import { LoginLink } from './login-link';
import { MobileMenu } from './mobile-menu';
import type { NavLink } from './navigation';
import type { ThemeMode } from './theme-mode';
import { ThemeToggle } from './theme-toggle';

/** Logo from the CMS page settings, used exactly as uploaded (never redrawn). Header + footer. */
export function SiteLogo({
  logo,
  className = 'vt-logo h-9 w-auto',
}: {
  logo: ResolvedMediaSlot;
  className?: string;
}) {
  const { desktop } = logo;
  const height = 40;
  const width =
    desktop.width && desktop.height ? Math.round((height * desktop.width) / desktop.height) : 40;
  const { props } = getImageProps({
    src: desktop.url,
    alt: '',
    width,
    height,
    quality: 90,
    priority: true,
  });
  // eslint-disable-next-line jsx-a11y/alt-text -- alt="" from getImageProps; the link carries the name
  return <img {...props} className={className} />;
}

/**
 * Public header — reference 'Website Funktional': a fixed glass bar over the full width with the
 * logo + wordmark on the left, the call to action in the centre (it fades in once the hero has
 * scrolled away — HeaderScrollState sets data-scrolled) and on the right the menu links, the
 * login and the light/dark switch at the very end. Phones: logo · switch · menu button.
 * Links, CTA and logo come from published CMS content (`buildNavigation`); without a CMS logo the
 * wordmark stands alone. The section in view is marked in the navigation (scrollspy).
 */
export function SiteHeader({
  items,
  cta,
  logo = null,
  overHero = false,
  heroDark = false,
  mode = 'dark',
}: {
  items: NavLink[];
  cta: NavLink | null;
  logo?: ResolvedMediaSlot | null;
  overHero?: boolean;
  heroDark?: 'stage' | false;
  mode?: ThemeMode;
}) {
  return (
    <header
      className="vf-header"
      data-over-hero={overHero || undefined}
      data-hero-dark={heroDark || undefined}
    >
      <HeaderScrollState />
      <div className="vf-header__bar">
        <Link href="/" className="vf-header__brand" aria-label="VITRUV – Startseite">
          {logo && <SiteLogo logo={logo} className="vf-header__logo" />}
          <span className="vf-wordmark">VITRUV</span>
        </Link>
        {cta && (
          <div className="vf-header__center">
            <a
              href={cta.href}
              className="vf-navcta"
              data-track="cta_click"
              data-track-section="header"
            >
              {cta.label}
            </a>
          </div>
        )}
        <div className="vf-header__end">
          {items.length > 0 && (
            <nav aria-label="Hauptnavigation" className="vf-header__nav">
              <ul>
                {items.map((item) => (
                  <li key={`${item.href}-${item.label}`}>
                    <a
                      className="vt-navlink vf-navlink"
                      href={item.href}
                      data-track="navigation_click"
                      data-track-section="header"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <LoginLink className="vf-login" />
          <ThemeToggle initial={mode} />
          <MobileMenu items={items} cta={cta} />
        </div>
      </div>
    </header>
  );
}
