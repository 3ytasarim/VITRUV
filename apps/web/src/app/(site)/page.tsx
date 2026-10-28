import type { Metadata } from 'next';
import { ReferenceHome } from '@/components/site/reference/reference-home';
import { SiteUnavailable } from '@/components/site/site-unavailable';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';
import { getPublicHome } from '@/lib/public-site';
import { buildHomeMetadata, buildStructuredData, serializeJsonLd } from '@/lib/seo';

// Rendered per request from the cached, tag-revalidated published content (see public-site.ts):
// no build-time API dependency, and a publish is visible without rebuild or restart.
export const dynamic = 'force-dynamic';

/** Title, description, canonical, Open Graph and robots — from the published SEO settings. */
export async function generateMetadata(): Promise<Metadata> {
  const result = await getPublicHome();
  return buildHomeMetadata(result.ok ? result.page : null, {
    siteUrl: publicSiteUrl(),
    indexing: isIndexingEnabled(),
  });
}

/**
 * The public homepage — the reference design 'Website Funktional' 1:1 (owner decision
 * 2026-10-28), rendered from the published CMS section `home` (all copy and every image/video
 * slot are edited in the admin).
 */
export default async function HomePage() {
  const result = await getPublicHome();
  if (!result.ok) return <SiteUnavailable />;
  const { page } = result;
  const home = page.sections.find((s) => s.type === 'home');
  if (home?.type !== 'home') return <SiteUnavailable />;
  const structuredData = buildStructuredData(page, publicSiteUrl());
  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          // A data block (not executed); `<` is escaped by serializeJsonLd.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      )}
      <ReferenceHome content={home.content} />
    </>
  );
}
