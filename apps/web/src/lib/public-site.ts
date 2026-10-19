import 'server-only';
import {
  publicWebsiteSectionSchema,
  type PublicWebsitePage,
  type PublicWebsiteSection,
} from '@vitruv/contracts';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { z } from 'zod';
import { webServerEnv } from './env';

/** Cache tag of the public homepage — expired by /api/revalidate after a publish. */
export const homeCacheTag = 'website:home';

/**
 * Safety net if a revalidation call is ever lost: the cached page data expires after this many
 * seconds and is refreshed in the background (stale-while-revalidate).
 */
export const PUBLIC_PAGE_REVALIDATE_SECONDS = 300;

export type PublicHomeResult = { ok: true; page: PublicWebsitePage } | { ok: false };

const envelopeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  contentRevision: z.number().int().nonnegative(),
  publishedAt: z.string().nullable(),
  sections: z.array(z.unknown()),
});

/**
 * Reads the PUBLISHED homepage from the shared API (never drafts, never the database).
 * Each section is re-validated on its own: an invalid or unknown section is dropped and logged,
 * the rest of the page still renders.
 */
async function fetchPublishedHome(): Promise<PublicWebsitePage> {
  const res = await fetch(new URL('/v1/public/website/pages/home', webServerEnv().API_BASE_URL), {
    cache: 'no-store', // caching is done by unstable_cache below (tagged, errors never cached)
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`public website API responded ${res.status}`);
  const envelope = envelopeSchema.parse(await res.json());
  const sections: PublicWebsiteSection[] = [];
  for (const raw of envelope.sections) {
    const parsed = publicWebsiteSectionSchema.safeParse(raw);
    if (parsed.success) sections.push(parsed.data);
    else console.error('[public-site] dropped a section that failed the public contract');
  }
  return { ...envelope, sections };
}

/** Cross-request data cache (Next data cache), invalidated by tag on publish. */
const loadPublishedHome = unstable_cache(fetchPublishedHome, ['public-website', 'home'], {
  tags: [homeCacheTag],
  revalidate: PUBLIC_PAGE_REVALIDATE_SECONDS,
});

/**
 * Published homepage for this request (deduplicated between layout and page). A failure is
 * returned — not thrown — so the site shell can show a calm "temporarily unavailable" state.
 * Failures are not cached: the next request tries again.
 */
export const getPublicHome = cache(async (): Promise<PublicHomeResult> => {
  try {
    return { ok: true, page: await loadPublishedHome() };
  } catch (error) {
    console.error('[public-site] published homepage unavailable:', (error as Error).message);
    return { ok: false };
  }
});
