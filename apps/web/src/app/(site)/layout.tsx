import type { ReactNode } from 'react';
import { AnalyticsBridge } from '@/components/site/analytics-bridge';
import { GravityStars } from '@/components/site/effects/gravity-stars';
import { buildNavigation, liveFooter, type SiteNavigation } from '@/components/site/navigation';
import { SiteFooter } from '@/components/site/sections/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { publicFontVariables } from '@/lib/fonts';
import { getPublicHome } from '@/lib/public-site';
import { pageTheme, themeCss } from '@/lib/theme';

// Header/footer depend on published CMS content: render per request (data itself is cached).
export const dynamic = 'force-dynamic';

/**
 * Public site shell: skip link, header (navigation + CTA from published CMS content), main,
 * and the CMS footer. Uses the same request-deduplicated, cached published content as the page.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const result = await getPublicHome();
  const navigation = result.ok
    ? buildNavigation(result.page)
    : ({
        items: [],
        cta: null,
        logo: null,
        overHero: false,
        heroDark: false,
      } satisfies SiteNavigation);
  const footer = result.ok ? liveFooter(result.page) : undefined;
  // Admin colour settings (CMS "Farben & Design"), validated hex values only.
  const theme = themeCss(result.ok ? pageTheme(result.page) : null);
  return (
    // Public surface: 'Greek Harmony' theme + fonts (tokens [data-surface='public']).
    <div className={`vt-site ${publicFontVariables}`} data-surface="public">
      {theme && <style>{theme}</style>}
      {/* Lowest layer: animated starfield, visible only in empty space. */}
      <GravityStars />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Zum Inhalt springen
      </a>
      <SiteHeader
        items={navigation.items}
        cta={navigation.cta}
        logo={navigation.logo}
        overHero={navigation.overHero}
        heroDark={navigation.heroDark}
      />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      {footer?.type === 'footer' && (
        <SiteFooter id={footer.key} content={footer.content} logo={navigation.logo} />
      )}
      <AnalyticsBridge />
    </div>
  );
}
