import { ArrowUp, ArrowUpRight } from 'lucide-react';
import { RevealGroup } from '@/components/ui';
import type { ResolvedMediaSlot } from '@vitruv/contracts';
import type { SectionProps } from '../section-props';
import { SiteLogo } from '../site-header';

/** Structural names of the social platforms in the CMS enum. */
const PLATFORM_NAME = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
} as const;

const isExternal = (href: string) => href.startsWith('https://');

/**
 * Footer — the Bleibsichtbar redesign footer (efferd/footer-section layout) in VITRUV colours,
 * entirely from published CMS content: inside the same wide frame as the next-step CTA card above,
 * a rounded-top shell with a soft gold light and a glowing line on its top edge; brand, display
 * line and copyright on the left; Seiten / Rechtliches / Kontakt columns on the right. Columns
 * fade in once. Empty groups are omitted; nothing is invented.
 */
export function SiteFooter({
  content,
  id,
  logo = null,
}: SectionProps<'footer'> & { logo?: ResolvedMediaSlot | null }) {
  const { email, phone, location } = content.contact;
  const hasContact = Boolean(email || phone || location || content.social.length > 0);
  const year = new Date().getFullYear();
  return (
    <div className="vt-wide">
      <footer id={id} className="vt-footer">
        <span aria-hidden className="vt-footer__line" />
        <div aria-hidden className="vt-footer__glow">
          <span />
          <span />
          <span />
        </div>
        <RevealGroup className="vt-footer__grid">
          <div className="vt-footer__brand">
            <a href="#main" className="vt-footer__logo" aria-label="VITRUV – nach oben">
              {logo && <SiteLogo logo={logo} className="h-12 w-auto" />}
              <span className="vt-wordmark text-fg">VITRUV</span>
            </a>
            {content.tagline && <p className="vt-footer__statement">{content.tagline}</p>}
          </div>

          <div className="vt-footer__cols">
            {content.navigation.length > 0 && (
              <nav aria-label="Footer-Navigation" className="vt-footer__col">
                <h4 className="vt-footer__label">Seiten</h4>
                <ul>
                  {content.navigation.map((link) => (
                    <li key={link.id}>
                      <a href={link.href} className="vt-footer__link">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {content.legal.length > 0 && (
              <div className="vt-footer__col">
                <h4 className="vt-footer__label">Rechtliches</h4>
                <ul>
                  {content.legal.map((link) => (
                    <li key={link.id}>
                      <a
                        href={link.href}
                        className="vt-footer__link"
                        {...(isExternal(link.href) ? { rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasContact && (
              <div className="vt-footer__col">
                <h4 className="vt-footer__label">Kontakt</h4>
                <ul>
                  {email && (
                    <li>
                      <a href={`mailto:${email}`} className="vt-footer__link">
                        {email}
                      </a>
                    </li>
                  )}
                  {phone && (
                    <li>
                      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="vt-footer__link">
                        {phone}
                      </a>
                    </li>
                  )}
                  {location && <li className="vt-footer__link">{location}</li>}
                  {content.social.map((profile) => (
                    <li key={profile.id}>
                      <a
                        href={profile.href}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="vt-footer__link inline-flex items-center gap-1"
                      >
                        {PLATFORM_NAME[profile.platform]}
                        <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.6} />
                        <span className="sr-only"> (öffnet in neuem Tab)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </RevealGroup>
        <div className="vt-footer__bar">
          <p>© VITRUV {year} · Alle Rechte vorbehalten</p>
          <a href="#main" className="vt-footer__top">
            Nach oben <ArrowUp aria-hidden className="size-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </footer>
    </div>
  );
}
