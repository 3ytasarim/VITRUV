import type { MetadataRoute } from 'next';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * robots.txt — public content allowed; internal surfaces disallowed. Not a security mechanism:
 * /admin, /design and previews additionally send noindex (metadata + X-Robots-Tag) and the admin
 * API requires authentication. SITE_INDEXING=disabled blocks everything (staging).
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = publicSiteUrl();
  if (!isIndexingEnabled()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/mein-training',
          '/login',
          '/aktivieren',
          '/design',
          '/_design',
          '/api/',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
