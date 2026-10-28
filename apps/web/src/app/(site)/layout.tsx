import type { PublicWebsitePage, ResolvedMediaSlot } from '@vitruv/contracts';
import { getImageProps } from 'next/image';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AnalyticsBridge } from '@/components/site/analytics-bridge';
import { ReferenceFooter } from '@/components/site/reference/reference-footer';
import { ReferenceHeader, type ReferenceLink } from '@/components/site/reference/reference-header';
import { THEME_COOKIE, parseThemeMode } from '@/components/site/theme-mode';
import { publicFontVariables } from '@/lib/fonts';
import { getPublicHome } from '@/lib/public-site';
import { referenceThemeCss } from '@/lib/theme';

// Header/footer depend on published CMS content: render per request (data itself is cached).
export const dynamic = 'force-dynamic';

/** CMS logo (page settings) as an optimised URL — shown unchanged (never redrawn). */
function logoSrc(logo: ResolvedMediaSlot | null | undefined): string | null {
  if (!logo) return null;
  return getImageProps({ src: logo.desktop.url, alt: '', width: 64, height: 64, quality: 90 }).props
    .src;
}

type Home = Extract<PublicWebsitePage['sections'][number], { type: 'home' }>['content'];

/** Footer links of the reference: Instagram / E-Mail (the CMS "Bewerben" channels), legal, login. */
function footerLinks(home: Home | null): ReferenceLink[] {
  const channel = (id: string) => home?.apply.channels.find((c) => c.id === id)?.href;
  const instagram = channel('instagram');
  const email = channel('email');
  return [
    ...(instagram?.startsWith('https://') ? [{ label: 'Instagram', href: instagram }] : []),
    ...(email?.startsWith('mailto:') ? [{ label: 'E-Mail', href: email }] : []),
    { label: 'Impressum', href: '/impressum' },
    { label: 'Datenschutz', href: '/datenschutz' },
    { label: 'Login', href: '/login' },
  ];
}

/** Centre header links = the page's blue section titles (CMS eyebrows), in page order. */
function headerLinks(home: Home | null): ReferenceLink[] {
  if (!home) return [];
  const items: [string | undefined, string][] = [
    [home.results.eyebrow, 'ergebnisse'],
    [home.journey.eyebrow, 'weg'],
    [home.included.eyebrow, 'leistung'],
    [home.packages.eyebrow, 'pakete'],
    [home.steps.eyebrow, 'ablauf'],
    [home.coach.eyebrow, 'coach'],
    [home.faq.eyebrow, 'faq'],
    [home.apply.eyebrow, 'bewerben'],
  ];
  return items.flatMap(([label, id]) => (label ? [{ label, href: `/#${id}` }] : []));
}

/**
 * Public site shell — the reference design `Website Funktional` 1:1 (owner decision 2026-10-28):
 * skip link, fixed glass header, main, black footer. Colours are the fixed reference palette
 * (dark by default, light via the header switch / preference cookie).
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const result = await getPublicHome();
  const page = result.ok ? result.page : null;
  const seo = page?.sections.find((s) => s.type === 'seo');
  const logo = logoSrc(seo?.type === 'seo' ? seo.content.logo : null);
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  const homeSection = page?.sections.find((s) => s.type === 'home');
  const home = homeSection?.type === 'home' ? homeSection.content : null;
  return (
    <div
      className={`vt-site ${publicFontVariables}`}
      data-surface="public"
      data-theme={mode === 'light' ? 'light' : undefined}
    >
      <style>{referenceThemeCss()}</style>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Zum Inhalt springen
      </a>
      <ReferenceHeader
        logoSrc={logo}
        cta={home?.headerCta ?? { label: 'Kontakt', href: '/kontakt' }}
        menu={home?.menu ?? []}
        links={headerLinks(home)}
        mode={mode}
      />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <ReferenceFooter logoSrc={logo} links={footerLinks(home)} />
      <AnalyticsBridge />
    </div>
  );
}
