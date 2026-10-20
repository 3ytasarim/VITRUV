import type { Metadata } from 'next';
import { setClientAccountAction, setClientPasswordAction } from '@/app/admin/management-actions';
import { AccountControls } from '@/components/admin/management/account-controls';
import { SetPasswordForm } from '@/components/admin/management/set-password-form';
import { Card } from '@/components/ui';
import { loadClient } from '@/lib/admin-data';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Konto · Kund:in' };

/**
 * Client account: login data (username / e-mail), staff-set password (owner decision
 * 2026-10-20 — no activation link for clients) and disable / re-enable.
 */
export default async function ClientAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission('clients.read', `/admin/kunden/${id}/konto`);
  const result = await loadClient(id);
  if (!result.ok) return null;
  const client = result.data;
  const name = `${client.firstName} ${client.lastName}`;
  const canManage = user.permissions.includes('clients.account.manage');
  return (
    <div className="grid gap-6">
      <Card padding="md">
        <h2 className="type-title mb-4">Zugang</h2>
        <dl className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <dt className="type-body-sm text-fg-muted">Benutzername</dt>
          <dd className="type-body font-semibold break-all">{client.username ?? '—'}</dd>
          <dt className="type-body-sm text-fg-muted">E-Mail</dt>
          <dd className="type-body break-all">{client.email ?? '—'}</dd>
        </dl>
        <p className="type-caption mt-3 text-fg-subtle">
          Anmeldung unter /login mit Benutzername oder E-Mail und Passwort.
        </p>
      </Card>
      {canManage && (
        <Card padding="md">
          <h2 className="type-title mb-4">Passwort setzen</h2>
          <SetPasswordForm
            personName={name}
            action={setClientPasswordAction.bind(null, client.id)}
          />
        </Card>
      )}
      <Card padding="md">
        <h2 className="type-title mb-4">Konto</h2>
        <AccountControls
          account={client.account}
          personName={name}
          canManage={canManage}
          setStatus={setClientAccountAction.bind(null, client.id)}
        />
      </Card>
    </div>
  );
}
