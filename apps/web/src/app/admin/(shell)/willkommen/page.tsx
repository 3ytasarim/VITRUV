import type { Metadata } from 'next';
import { AdminPageHeader, ErrorState } from '@/components/admin/states';
import { WelcomeManager } from '@/components/admin/welcome/welcome-manager';
import { requirePagePermission } from '@/lib/auth/session';
import { welcomeApi } from '@/lib/welcome-api';

export const metadata: Metadata = { title: 'Willkommen' };

/**
 * "Willkommen" videos for all clients (ADMIN): categories become the tabs in the client area,
 * videos come from the training media library (upload directly in the picker).
 */
export default async function WelcomeAdminPage() {
  await requirePagePermission('welcome.manage', '/admin/willkommen');
  const result = await welcomeApi.overview();
  return (
    <>
      <AdminPageHeader
        title="Willkommen"
        description="Videos, die alle Kund:innen unter „Willkommen“ in ihrem Bereich sehen. Lege Kategorien an (sie erscheinen als Tabs) und füge jeder Kategorie Videos hinzu."
      />
      {result.ok ? (
        <WelcomeManager initial={result.data} />
      ) : (
        <ErrorState message={result.error.message} />
      )}
    </>
  );
}
