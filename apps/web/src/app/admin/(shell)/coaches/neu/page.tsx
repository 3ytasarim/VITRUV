import type { Metadata } from 'next';
import { CoachCreateForm } from '@/components/admin/management/coach-create-form';
import { AdminPageHeader } from '@/components/admin/states';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Coach anlegen' };

export default async function NewCoachPage() {
  await requirePagePermission('coaches.create', '/admin/coaches/neu');
  return (
    <>
      <AdminPageHeader
        title="Coach anlegen"
        description="Konto mit Rolle Coach, ohne Passwort – der Coach wählt es selbst über einen einmaligen Link."
      />
      <CoachCreateForm />
    </>
  );
}
