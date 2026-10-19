import type { Metadata } from 'next';
import { SectionEditor } from '@/components/admin/editor/section-editor';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { adminApi } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Website-Einstellungen' };
export const dynamic = 'force-dynamic';

/**
 * Website settings. Currently: search engine / link-preview settings (the `seo` page-settings
 * document — draft → publish like every section). Section order/visibility stay API-only.
 */
export default async function WebsiteSettingsPage() {
  const [detail, media] = await Promise.all([adminApi.section('seo'), adminApi.mediaList()]);
  const header = (
    <AdminPageHeader
      title="Einstellungen"
      description="SEO und Link-Vorschau der Startseite. Änderungen werden erst nach „Veröffentlichen“ wirksam; die kanonische Adresse wird pro Umgebung konfiguriert (PUBLIC_SITE_URL)."
    />
  );
  if (!detail.ok) {
    return (
      <>
        {header}
        {detail.status === 404 ? (
          <EmptyState title="SEO-Einstellungen sind noch nicht angelegt">
            Mit <code>pnpm --filter @vitruv/api seed:website</code> anlegen.
          </EmptyState>
        ) : (
          <ErrorState message={detail.error.message} />
        )}
      </>
    );
  }
  if (!media.ok) {
    return (
      <>
        {header}
        <ErrorState title="Mediathek nicht verfügbar" message={media.error.message} />
      </>
    );
  }
  const { section, draft, published } = detail.data;
  return (
    <>
      {header}
      <SectionEditor
        sectionKey={section.key}
        type={section.type}
        summary={section}
        draft={draft?.content ?? null}
        published={published?.content ?? null}
        media={media.data.items}
        previewable={false}
      />
    </>
  );
}
