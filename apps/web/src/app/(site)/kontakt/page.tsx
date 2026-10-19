import type { Metadata } from 'next';
import { ContactForm } from '@/components/site/contact-form';
import { Card, Section, SectionIntro } from '@/components/ui';
import { absoluteUrl } from '@/lib/seo';
import { isIndexingEnabled, publicSiteUrl } from '@/lib/env';
import { getPublicHome } from '@/lib/public-site';

export const dynamic = 'force-dynamic';

/** Server render time of the form (per request) — the API uses it for its plausibility check. */
function formRenderedAt(): number {
  return Date.now();
}

export function generateMetadata(): Metadata {
  return {
    title: 'Kontakt',
    alternates: { canonical: absoluteUrl(publicSiteUrl(), '/kontakt') },
    robots: isIndexingEnabled() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

/**
 * Contact / coaching inquiry. The introduction reuses the published closing-CTA copy from the
 * CMS (no second hardcoded marketing text); the form labels are structural UI.
 */
export default async function ContactPage() {
  const home = await getPublicHome();
  const cta = home.ok ? home.page.sections.find((s) => s.type === 'cta') : undefined;
  const intro = cta?.type === 'cta' ? cta.content : null;
  return (
    <Section labelledBy="kontakt-title">
      <div className="grid gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <SectionIntro
          eyebrow={intro?.eyebrow}
          title={intro?.title ?? 'Kontakt'}
          lead={intro?.body}
          level={1}
          size="h1"
          emphasis
          titleId="kontakt-title"
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <Card padding="lg" cut="md">
          <ContactForm startedAt={formRenderedAt()} />
        </Card>
      </div>
    </Section>
  );
}
