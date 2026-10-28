import type { ReferenceLink } from './reference-header';

/**
 * Footer of the reference design: black bar, logo + "© year VITRUV" on the left, small uppercase
 * links on the right (Instagram / E-Mail from the CMS contact data when set, Impressum,
 * Datenschutz, and the login to the client area).
 */
export function ReferenceFooter({
  logoSrc,
  links,
}: {
  logoSrc: string | null;
  links: ReferenceLink[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="r-footer">
      <div className="r-footer__inner">
        <div className="r-footer__brand">
          {logoSrc && <img src={logoSrc} alt="" width={26} height={26} />}
          <span>© {year} VITRUV</span>
        </div>
        <nav aria-label="Footer-Navigation" className="r-footer__links">
          {links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              {...(link.href.startsWith('https://')
                ? { rel: 'noopener noreferrer', target: '_blank' }
                : {})}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
