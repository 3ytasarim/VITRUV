import type { Metadata } from 'next';
import { Fragment } from 'react';
import { MethodStrip } from '@/components/site/effects/method-strip';
import { placementOf } from '@/components/site/placement';
import { PublicSection } from '@/components/site/section-registry';
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
 * The public homepage — assembled entirely from PUBLISHED CMS content, in the API's order
 * (DB sort order; disabled and unpublished sections are already excluded by the API).
 */
export default async function HomePage() {
  const result = await getPublicHome();
  if (!result.ok) return <SiteUnavailable />;
  const sections = result.page.sections.filter((s) => placementOf(s.type) === 'main');
  const hasHero = sections.some((s) => s.type === 'hero');
  const structuredData = buildStructuredData(result.page, publicSiteUrl());
  // Method strip under the hero: pillars and their steps from published CMS content (Neun
  // Stufen grouped by pillar, else the pillar names alone) — no copy in the component.
  const steps = sections.find((s) => s.type === 'steps');
  const pillars = sections.find((s) => s.type === 'pillars');
  const groups: { name: string; title?: string; lead?: string; steps: string[] }[] = [];
  if (steps?.type === 'steps') {
    for (const item of steps.content.items) {
      const group = groups.find((g) => g.name === item.group);
      if (group) group.steps.push(item.title);
      else groups.push({ name: item.group, steps: [item.title] });
    }
  } else if (pillars?.type === 'pillars') {
    for (const pillar of pillars.content.pillars) groups.push({ name: pillar.name, steps: [] });
  }
  // Title and lead of each group from the matching pillar (same name), if published.
  if (pillars?.type === 'pillars') {
    for (const group of groups) {
      const pillar = pillars.content.pillars.find((p) => p.name === group.name);
      if (pillar) Object.assign(group, { title: pillar.title, lead: pillar.lead });
    }
  }
  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          // A data block (not executed); `<` is escaped by serializeJsonLd.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      )}
      {/* The hero provides the page's h1; without a hero the page title stands in (visually hidden). */}
      {!hasHero && <h1 className="sr-only">{result.page.title}</h1>}
      {sections.map((section) => (
        <Fragment key={section.key}>
          <PublicSection section={section} />
          {section.type === 'hero' && groups.length > 0 && <MethodStrip groups={groups} />}
        </Fragment>
      ))}
    </>
  );
}
