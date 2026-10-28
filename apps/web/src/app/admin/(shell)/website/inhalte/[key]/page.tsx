import { sectionKeySchema } from '@vitruv/contracts';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionEditor } from '@/components/admin/editor/section-editor';
import { SECTION_LABELS, isEditableContent } from '@/components/admin/section-registry';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { ButtonLink } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Bereich bearbeiten' };

export default async function SectionEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!sectionKeySchema.safeParse(key).success) notFound();

  const [detail, media] = await Promise.all([adminApi.section(key), adminApi.mediaList()]);
  const back = (
    <ButtonLink variant="ghost" icon={<ArrowLeft />} href="/admin/website/inhalte">
      Alle Bereiche
    </ButtonLink>
  );
  if (!detail.ok) {
    if (detail.status === 404) notFound();
    return (
      <>
        <AdminPageHeader title="Bereich bearbeiten" actions={back} />
        <ErrorState message={detail.error.message} />
      </>
    );
  }

  const { section, draft, published } = detail.data;
  if (!isEditableContent(section.type)) notFound();
  const label = SECTION_LABELS[section.type];

  if (!media.ok) {
    return (
      <>
        <AdminPageHeader title={label} actions={back} />
        <ErrorState title="Mediathek nicht verfügbar" message={media.error.message} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title={label} actions={back} />
      <SectionEditor
        sectionKey={section.key}
        type={section.type}
        summary={section}
        draft={draft?.content ?? null}
        published={published?.content ?? null}
        media={media.data.items}
      />
    </>
  );
}
