import type { Metadata } from 'next';
import {
  regenerateClientActivationAction,
  setClientAccountAction,
} from '@/app/admin/management-actions';
import { AccountControls } from '@/components/admin/management/account-controls';
import { Card } from '@/components/ui';
import { loadClient } from '@/lib/admin-data';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Konto · Kund:in' };

export default async function ClientAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission('clients.read', `/admin/kunden/${id}/konto`);
  const result = await loadClient(id);
  if (!result.ok) return null;
  const client = result.data;
  return (
    <Card padding="md">
      <h2 className="type-title mb-4">Konto</h2>
      <AccountControls
        account={client.account}
        personName={`${client.firstName} ${client.lastName}`}
        canManage={user.permissions.includes('clients.account.manage')}
        setStatus={setClientAccountAction.bind(null, client.id)}
        regenerate={regenerateClientActivationAction.bind(null, client.id)}
      />
    </Card>
  );
}
