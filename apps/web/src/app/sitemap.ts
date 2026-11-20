import type { MetadataRoute } from 'next';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';
import { getPublicHome } from '@/lib/public-site';

export const dynamic = 'force-dynamic';

/**
 * Indexable public routes only. Not listed: /admin, /design, previews, API routes and the legal
 * placeholder page (Datenschutz — noindex until the approved text exists); /impressum was removed
 * on owner request 2026-11-20.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexingEnabled()) return [];
  const siteUrl = publicSiteUrl();
  const home = await getPublicHome();
  const lastModified =
    home.ok && home.page.publishedAt ? new Date(home.page.publishedAt) : undefined;
  return [
    { url: `${siteUrl}/`, ...(lastModified ? { lastModified } : {}) },
    { url: `${siteUrl}/kontakt` },
  ];
}
