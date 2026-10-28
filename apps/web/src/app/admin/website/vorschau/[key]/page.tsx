import { sectionKeySchema } from '@vitruv/contracts';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionPreview } from '@/components/admin/preview/section-preview';
import { SECTION_LABELS, formatDateTime } from '@/components/admin/section-registry';
import { ErrorState } from '@/components/admin/states';
import { Badge, ButtonLink, Container } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';
import { publicFontVariables } from '@/lib/fonts';
import { referenceThemeCss } from '@/lib/theme';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Vorschau',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Draft preview of one section, rendered full width with the website components.
 * Internal (admin, noindex, not linked publicly). Reads the draft through the admin API — it never
 * changes published content. ADMIN only (Website CMS); everyone else gets 404.
 */
export default async function SectionPreviewPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await requirePagePermission('website.content.read', `/admin/website/vorschau/${key}`);
  if (!sectionKeySchema.safeParse(key).success) notFound();
  const preview = await adminApi.preview(key);

  if (!preview.ok) {
    if (preview.status === 404 && preview.error.message.includes('Bereich')) notFound();
    return (
      <Container className="py-16">
        <ErrorState title="Vorschau nicht verfügbar" message={preview.error.message} />
      </Container>
    );
  }

  const { section, source, updatedAt, content } = preview.data;
  // Same surface, fonts and reference colours as the public site, so the draft looks exactly
  // like the live page.
  return (
    <div className={`vt-site ${publicFontVariables}`} data-surface="public">
      <style>{referenceThemeCss()}</style>
      <div className="sticky top-0 z-50 border-b border-warning bg-surface-sunken">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={source === 'DRAFT' ? 'warning' : 'success'} dot>
              {source === 'DRAFT' ? 'Entwurf · nicht veröffentlicht' : 'Veröffentlichter Stand'}
            </Badge>
            <span className="type-caption text-fg-muted">
              {SECTION_LABELS[section.type]} · gespeichert {formatDateTime(updatedAt)}
              {' · Website-Komponente'}
            </span>
          </div>
          <ButtonLink
            variant="ghost"
            icon={<ArrowLeft />}
            href={`/admin/website/inhalte/${section.key}`}
          >
            Zum Editor
          </ButtonLink>
        </Container>
      </div>
      <main id="main">
        {/* The hero and the homepage render their own h1; other sections start at h2. */}
        {section.type !== 'hero' && section.type !== 'home' && (
          <h1 className="sr-only">Vorschau: {SECTION_LABELS[section.type]}</h1>
        )}
        <SectionPreview type={section.type} sectionKey={section.key} content={content} />
      </main>
    </div>
  );
}
