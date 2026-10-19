import type { Metadata } from 'next';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { formatDateTime } from '@/components/admin/section-registry';
import { ButtonLink, Card } from '@/components/ui';
import { placementOf } from '@/components/site/placement';
import { adminApi } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Website' };
export const dynamic = 'force-dynamic';

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card padding="sm" className="flex flex-col gap-1">
      <p className="type-caption text-fg-subtle">{label}</p>
      <p className="type-h3">{value}</p>
      {detail && <p className="type-caption text-fg-muted">{detail}</p>}
    </Card>
  );
}

export default async function WebsiteOverviewPage() {
  const [page, media] = await Promise.all([adminApi.page(), adminApi.mediaList()]);
  if (!page.ok) {
    return (
      <>
        <AdminPageHeader title="Website" />
        <ErrorState message={page.error.message} />
      </>
    );
  }
  const sections = page.data.sections.filter((s) => placementOf(s.type) !== 'meta');
  const drafts = sections.filter((s) => s.hasDraft).length;
  const published = sections.filter((s) => s.hasPublished).length;
  const empty = sections.filter((s) => !s.hasPublished && !s.hasDraft).length;

  return (
    <>
      <AdminPageHeader
        title="Website"
        description="Inhalte und Medien der öffentlichen Website. Änderungen werden erst nach „Veröffentlichen“ sichtbar."
        actions={
          <>
            <ButtonLink href="/admin/website/inhalte">Inhalte bearbeiten</ButtonLink>
            <ButtonLink variant="secondary" href="/admin/website/medien">
              Medien
            </ButtonLink>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Bereiche veröffentlicht" value={`${published} / ${sections.length}`} />
        <Stat
          label="Offene Entwürfe"
          value={String(drafts)}
          detail={drafts > 0 ? 'Noch nicht öffentlich' : 'Alles veröffentlicht'}
        />
        <Stat label="Ohne Inhalt" value={String(empty)} />
        <Stat
          label="Medien"
          value={media.ok ? String(media.data.items.length) : '—'}
          detail={media.ok ? undefined : media.error.message}
        />
      </div>
      <p className="type-body-sm mt-6 text-fg-muted">
        Letzte Veröffentlichung: {formatDateTime(page.data.lastPublishedAt)} · Inhaltsversion{' '}
        {page.data.contentRevision}
      </p>
    </>
  );
}
