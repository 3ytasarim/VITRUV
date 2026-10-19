import { LogOut } from 'lucide-react';
import type { Metadata } from 'next';
import { logoutAllAction } from '@/app/admin/account-actions';
import { AdminPageHeader } from '@/components/admin/states';
import { PasswordChangeForm } from '@/components/auth/password-change-form';
import { Badge, Button, Card } from '@/components/ui';
import { requireAdminUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Konto & Sicherheit' };

const ROLE_LABEL = { ADMIN: 'Admin', COACH: 'Coach', CLIENT: 'Kund:in' } as const;

export default async function AccountPage() {
  const { user } = await requireAdminUser('/admin/konto');
  return (
    <div className="max-w-measure-display">
      <AdminPageHeader title="Konto & Sicherheit" />
      <div className="grid gap-6">
        <Card padding="md" className="flex flex-col gap-4">
          <h2 className="type-title">Konto</h2>
          <dl className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="type-body-sm text-fg-muted">E-Mail</dt>
            <dd className="type-body break-all">{user.email}</dd>
            <dt className="type-body-sm text-fg-muted">Rolle</dt>
            <dd>
              <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
            </dd>
          </dl>
        </Card>
        <Card padding="md" className="flex flex-col gap-4">
          <h2 className="type-title">Passwort ändern</h2>
          <PasswordChangeForm />
        </Card>
        <Card padding="md" className="flex flex-col gap-4">
          <h2 className="type-title">Sitzungen</h2>
          <p className="type-body-sm text-fg-muted">
            Beendet die Anmeldung auf allen Geräten und Browsern – auch hier. Sinnvoll, wenn du ein
            Gerät verloren hast oder dein Passwort jemand anderem bekannt sein könnte.
          </p>
          <form action={logoutAllAction}>
            <Button type="submit" variant="secondary" icon={<LogOut aria-hidden />}>
              Überall abmelden
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
