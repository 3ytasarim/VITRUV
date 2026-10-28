import type { Metadata } from 'next';
import Link from 'next/link';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return {
    title: 'Impressum',
    alternates: { canonical: absoluteUrl(publicSiteUrl(), '/impressum') },
    robots: isIndexingEnabled() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/** Legal notice — content of the owner's `Impressum.dc.html`, in the site's reference design. */
const REGISTER: [string, string][] = [
  ['Eintragung', 'Eintragung im Handelsregister'],
  ['Registergericht', 'New Mexico'],
  ['Registernummer', 'EIN 332473414'],
];

export default function ImpressumPage() {
  return (
    <div className="r-page">
      <section className="r-legal" aria-labelledby="impressum-title">
        <div className="r-legal__head">
          <span className="r-eyebrow">Rechtliches</span>
          <h1 id="impressum-title" className="r-legal__title">
            Impressum
          </h1>
        </div>

        <div className="r-legal__card">
          <span className="r-eyebrow">Angaben gemäß § 5 TMG</span>
          <address className="r-legal__address">
            <span className="r-legal__company">RUFSCHMIEDE LLC</span>
            <span>1209 Mountain Road PL NE, Suite R</span>
            <span>Albuquerque, New Mexico, 87110</span>
            <span>USA</span>
          </address>
          <p className="r-legal__note">
            VITRUV ist ein Geschäftsbereich der RUFSCHMIEDE LLC und keine eigenständige
            Gesellschaft.
          </p>
        </div>

        <div className="r-legal__card">
          <span className="r-eyebrow">Registereintrag</span>
          <dl className="r-legal__rows">
            {REGISTER.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Link href="/" className="r-legal__back">
          ← Zurück zur Seite
        </Link>
      </section>
    </div>
  );
}
