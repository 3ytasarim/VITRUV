import type { ResolvedMediaSlot } from '@vitruv/contracts';
import { Container } from '@/components/ui';
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
 * Footer — reference 'Website Funktional': when the CMS has contact data, a row of contact
 * cards (social profiles, e-mail, phone) under the CMS tagline; then the black bottom bar with
 * logo + © year on the left and the small uppercase links (social, e-mail, navigation, legal)
 * on the right. Entirely from published CMS content; empty groups are omitted, nothing invented.
 */
export function SiteFooter({
  content,
  id,
  logo = null,
}: SectionProps<'footer'> & { logo?: ResolvedMediaSlot | null }) {
  const { email, phone, location } = content.contact;
  const year = new Date().getFullYear();
  const cards = [
    ...content.social.map((profile) => ({
      key: profile.id,
      tag: PLATFORM_NAME[profile.platform].slice(0, 2).toUpperCase(),
      title: PLATFORM_NAME[profile.platform],
      href: profile.href,
      text: null as string | null,
    })),
    ...(email
      ? [{ key: 'email', tag: '@', title: 'E-Mail', href: `mailto:${email}`, text: email }]
      : []),
    ...(phone
      ? [
          {
            key: 'phone',
            tag: 'TEL',
            title: 'Telefon',
            href: `tel:${phone.replace(/[^\d+]/g, '')}`,
            text: phone,
          },
        ]
      : []),
  ];
  const links = [...content.navigation, ...content.legal];
  return (
    <footer id={id} className="vf-footer">
      {(cards.length > 0 || location) && (
        <Container className="vf-footer__contact">
          {content.tagline && <p className="vf-footer__tagline">{content.tagline}</p>}
          {cards.length > 0 && (
            <ul className="vf-grid vf-grid--3">
              {cards.map((card) => (
                <li key={card.key}>
                  <a
                    href={card.href}
                    className="vf-contact"
                    {...(isExternal(card.href)
                      ? { rel: 'noopener noreferrer', target: '_blank' }
                      : {})}
                  >
                    <span aria-hidden className="vf-contact__tag">
                      {card.tag}
                    </span>
                    <span className="vf-contact__title">{card.title}</span>
                    {card.text && <span className="vf-contact__text">{card.text}</span>}
                    {isExternal(card.href) && (
                      <span className="sr-only"> (öffnet in neuem Tab)</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {location && <p className="vf-meta">{location}</p>}
        </Container>
      )}
      <div className="vf-footer__bar">
        <Container className="vf-footer__inner">
          <a href="#main" className="vf-footer__brand" aria-label="VITRUV – nach oben">
            {logo && <SiteLogo logo={logo} className="vf-footer__logo" />}
            <span>© {year} VITRUV</span>
          </a>
          {links.length > 0 && (
            <nav aria-label="Footer-Navigation">
              <ul className="vf-footer__links">
                {links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      {...(isExternal(link.href) ? { rel: 'noopener noreferrer' } : {})}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </Container>
      </div>
    </footer>
  );
}
