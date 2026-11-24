import type { PublicSectionContent } from '@vitruv/contracts';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { CmsMedia } from '@/components/cms/cms-media';
import { DitherBand } from './dither-band';
import type { ReferenceLink } from './reference-header';

type Apply = PublicSectionContent<'home'>['apply'];

/**
 * Partner logo next to the contact block (owner 2026-11-24, "Nature Heart"): bundled like the
 * VITRUV logo — black ink, inverted by the theme's logo filter on dark backgrounds. A logo uploaded
 * in the CMS (Bewerben → "Logo im Footer") replaces it.
 */
const PARTNER_LOGO = {
  src: '/brand/nature-heart.png',
  alt: 'Nature Heart',
  width: 960,
  height: 122,
};

/** Agency credit in the bottom bar (owner request 2026-11-18). */
const CREDIT_URL = 'https://www.bleibsichtbar.com';

const external = (href: string) =>
  href.startsWith('https://') ? { rel: 'noopener noreferrer', target: '_blank' } : {};

/**
 * Footer = the "Dithered Footer" layout (MIT, @otatechie; owner request 2026-11-09) in the site
 * colours: brand column (logo, CMS "Bewerben" lead, the contact channels as buttons — anchor
 * #bewerben) + three link columns, the dithered dot band in the site blue with "VITRUV" cut out
 * of it, and the bottom bar (©, channel shortcuts, back to top).
 */
export function ReferenceFooter({
  logoSrc,
  links,
  sections = [],
  apply,
}: {
  logoSrc: string | null;
  /** Account links (Login). */
  links: ReferenceLink[];
  /** Page sections (the blue eyebrows) for the "Seite" column. */
  sections?: ReferenceLink[];
  apply?: Apply | null;
}) {
  const year = new Date().getFullYear();
  const channels = apply?.channels ?? [];
  const half = Math.ceil(sections.length / 2);
  const columns: { label: string; items: ReferenceLink[] }[] = [
    { label: 'Coaching', items: sections.slice(0, half) },
    { label: 'Ablauf', items: sections.slice(half) },
    { label: 'Konto', items: links },
  ].filter((c) => c.items.length > 0);
  const badge = apply?.badge ?? null;
  const badgeRatio =
    badge?.desktop.width && badge.desktop.height
      ? `${badge.desktop.width} / ${badge.desktop.height}`
      : '1 / 1';

  return (
    <footer className="r-footer">
      <div className="df-top">
        <section id="bewerben" className="df-brand" aria-labelledby="bewerben-title">
          <Link href="/#top" className="df-logo" aria-label="VITRUV – nach oben">
            {logoSrc ? <img src={logoSrc} alt="" width={127} height={72} /> : 'VITRUV'}
          </Link>
          {apply?.lead && <p className="df-text">{apply.lead}</p>}
          {apply && (
            <div className="df-apply">
              <h2 id="bewerben-title" className="df-label">
                {apply.title}
              </h2>
              {channels.length > 0 && (
                <div className="df-channels">
                  {channels.map((ch, i) => (
                    <a
                      key={ch.id}
                      href={ch.href}
                      className={i === 0 ? 'df-btn df-btn--solid' : 'df-btn'}
                      {...external(ch.href)}
                      data-track="cta_click"
                      data-track-section="apply"
                      data-track-label={ch.id}
                    >
                      {ch.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* owner 2026-11-24: partner logo ("Nature Heart") right under the contact buttons */}
          <div className="df-badge">
            {badge ? (
              <div className="df-badge__media" style={{ aspectRatio: badgeRatio }}>
                <CmsMedia slot={badge} sizes="200px" mobileSizes="180px" />
              </div>
            ) : (
              <img
                className="df-badge__logo"
                src={PARTNER_LOGO.src}
                alt={PARTNER_LOGO.alt}
                width={PARTNER_LOGO.width}
                height={PARTNER_LOGO.height}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </section>
        {columns.map((col) => (
          <nav key={col.label} aria-label={col.label} className="df-col">
            <p className="df-col__title">{col.label}</p>
            <ul>
              {col.items.map((link) => (
                <li key={link.href + link.label}>
                  <a href={link.href} {...external(link.href)}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <DitherBand word="VITRUV" />

      <div className="df-bottom">
        <div className="df-bottom__inner">
          <div className="df-bottom__left">
            <p>© {year} VITRUV</p>
            <a
              href={CREDIT_URL}
              className="df-credit"
              {...external(CREDIT_URL)}
              aria-label="Designed by Bleibsichtbar (öffnet in einem neuen Tab)"
              data-track="outbound_click"
              data-track-label="bleibsichtbar"
            >
              <span aria-hidden className="df-credit__dot" />
              <span className="df-credit__by">Designed by</span>
              <span className="df-credit__name">Bleibsichtbar</span>
              <ArrowUpRight aria-hidden className="df-credit__arrow" />
            </a>
          </div>
          <div className="df-bottom__right">
            {channels.map((ch) => (
              <a
                key={ch.id}
                href={ch.href}
                aria-label={ch.title}
                title={ch.title}
                className="df-social"
                {...external(ch.href)}
              >
                <span aria-hidden>{ch.tag}</span>
              </a>
            ))}
            {channels.length > 0 && <span aria-hidden className="df-sep" />}
            <Link href="/#top" className="df-top-link">
              Nach oben <span aria-hidden>↑</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
