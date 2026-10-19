import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { ArrowUpRight } from 'lucide-react';
import { getImageProps } from 'next/image';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { HeaderScrollState } from './header-scroll-state';
import { LoginLink } from './login-link';
import { MobileMenu } from './mobile-menu';
import type { NavLink } from './navigation';

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
 * Public header — a floating glass pill (logo · navigation · call to action) that hides while
 * reading downwards and returns on the first scroll up; the section in view is marked in the
 * navigation (HeaderScrollState: data-scrolled / data-hidden / link data-active).
 * Over the hero (`overHero`) the header floats on the hero itself — no separate colour band; over a
 * hero with media (`heroDark`) the pill starts as dark glass with light copy on the video
 * (pattern adapted from the Meridius.ch header over its hero). Links, CTA and logo come from
 * published CMS content (`buildNavigation`); without a CMS logo the wordmark stands alone.
 */
export function SiteHeader({
  items,
  cta,
  logo = null,
  overHero = false,
  heroDark = false,
}: {
  items: NavLink[];
  cta: NavLink | null;
  logo?: ResolvedMediaSlot | null;
  overHero?: boolean;
  heroDark?: 'stage' | false;
}) {
  return (
    <header
      className="vt-site-header"
      data-over-hero={overHero || undefined}
      data-hero-dark={heroDark || undefined}
    >
      <HeaderScrollState />
      <div className="vt-header-pill">
        <Link href="/" className="vt-header-brand" aria-label="VITRUV – Startseite">
          {logo && <SiteLogo logo={logo} />}
          <span className="vt-wordmark">VITRUV</span>
        </Link>
        {items.length > 0 && (
          <nav aria-label="Hauptnavigation" className="vt-header-nav">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <a
                    className="vt-navlink"
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
        <div className="flex items-center gap-2">
          <LoginLink />
          {cta && (
            <ButtonLink
              href={cta.href}
              icon={<ArrowUpRight />}
              iconPosition="end"
              className="vt-header-cta"
              data-track="cta_click"
              data-track-section="header"
            >
              {cta.label}
            </ButtonLink>
          )}
          <MobileMenu items={items} cta={cta} />
        </div>
      </div>
    </header>
  );
}
