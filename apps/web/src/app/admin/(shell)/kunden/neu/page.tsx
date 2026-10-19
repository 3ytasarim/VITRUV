import type { Metadata } from 'next';
import { ClientCreateForm } from '@/components/admin/management/client-create-form';
import { AdminPageHeader } from '@/components/admin/states';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Kund:in anlegen' };

export default async function NewClientPage() {
  const user = await requirePagePermission('clients.create', '/admin/kunden/neu');
  // ADMIN chooses the coach; a COACH always creates for themselves (enforced by the API).
  const options = user.permissions.includes('clients.assign')
    ? await adminApi.coachOptions()
    : null;
  return (
    <>
      <AdminPageHeader
        title="Kund:in anlegen"
        description="Konto ohne Passwort – die Person aktiviert es selbst über einen einmaligen Link."
      />
      <ClientCreateForm coaches={options?.ok ? options.data.items : options ? [] : null} />
    </>
  );
}
