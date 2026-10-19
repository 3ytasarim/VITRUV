import type { Metadata } from 'next';
import { MediaLibrary } from '@/components/admin/media/media-library';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { adminApi } from '@/lib/admin-api';

export const metadata: Metadata = { title: 'Medien' };
export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const media = await adminApi.mediaList();
  return (
    <>
      <AdminPageHeader
        title="Medien"
        description="Bilder und Videos der Website. Verwendete Medien sind vor dem Löschen geschützt."
      />
      {media.ok ? (
        <MediaLibrary initialItems={media.data.items} />
      ) : (
        <ErrorState message={media.error.message} />
      )}
    </>
  );
}
