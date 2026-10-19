import type { Metadata } from 'next';
import { assignClientAction, updateClientAction } from '@/app/admin/management-actions';
import { AssignmentControl } from '@/components/admin/management/assignment-control';
import { ClientProfileForm } from '@/components/admin/management/client-profile-form';
import { Card } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { loadClient } from '@/lib/admin-data';
import { requirePagePermission } from '@/lib/auth/session';
import { COACH_TEAM_ENABLED } from '@/lib/team';

export const metadata: Metadata = { title: 'Profil · Kund:in' };

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission('clients.read', `/admin/kunden/${id}/profil`);
  const result = await loadClient(id);
  if (!result.ok) return null;
  const client = result.data;
  const canEdit = user.permissions.includes('clients.update');
  const canAssign = COACH_TEAM_ENABLED && user.permissions.includes('clients.assign');
  const options = canAssign ? await adminApi.coachOptions() : null;
  return (
    <div className="grid gap-6">
      <Card padding="md">
        <h2 className="type-title mb-4">Profil</h2>
        {canEdit ? (
          <ClientProfileForm client={client} action={updateClientAction.bind(null, client.id)} />
        ) : (
          <p className="type-body-sm text-fg-muted">Keine Berechtigung zum Bearbeiten.</p>
        )}
      </Card>
      {canAssign && options?.ok && (
        <Card padding="md">
          <h2 className="type-title mb-4">Coach-Zuordnung</h2>
          <AssignmentControl
            current={client.coach}
            coaches={options.data.items}
            clientName={`${client.firstName} ${client.lastName}`}
            assign={assignClientAction.bind(null, client.id)}
          />
        </Card>
      )}
    </div>
  );
}
