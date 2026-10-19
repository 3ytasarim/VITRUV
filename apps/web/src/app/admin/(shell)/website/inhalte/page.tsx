import type { Metadata } from 'next';
import { ContentOverview } from '@/components/admin/content-overview';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { adminApi } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Inhalte' };
export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const page = await adminApi.page();
  return (
    <>
      <AdminPageHeader
        title="Inhalte · Startseite"
        description="Jeder Bereich hat einen veröffentlichten Stand und optional einen Entwurf. Die Website zeigt immer den veröffentlichten Stand."
      />
      {page.ok ? <ContentOverview page={page.data} /> : <ErrorState message={page.error.message} />}
    </>
  );
}
