import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  regenerateCoachActivationAction,
  setCoachAccountAction,
  updateCoachAction,
} from '@/app/admin/management-actions';
import { AccountControls } from '@/components/admin/management/account-controls';
import { CoachProfileForm } from '@/components/admin/management/coach-profile-form';
import { AccountBadge } from '@/components/admin/management/status-badges';
import { ErrorState } from '@/components/admin/states';
import { ButtonLink, Card } from '@/components/ui';
import { loadCoach } from '@/lib/admin-data';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Coach' };

export default async function CoachDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePagePermission('coaches.read', `/admin/coaches/${id}`);
  const result = await loadCoach(id);
  if (!result.ok) return <ErrorState message="Der Coach konnte nicht geladen werden." />;
  const coach = result.data;
  return (
    <div className="max-w-measure-display">
      <Link
        href="/admin/coaches"
        className="type-caption mb-4 inline-flex min-h-12 items-center gap-2 text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" /> Alle Coaches
      </Link>
      <header className="mb-8 flex flex-col gap-3">
        <h1 className="type-h2 break-words">{coach.displayName}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <AccountBadge account={coach.account} />
          <span className="type-body-sm text-fg-muted">{coach.email}</span>
        </div>
      </header>
      <div className="grid gap-6">
        <Card padding="md" className="flex flex-col items-start gap-3">
          <h2 className="type-title">Kund:innen</h2>
          <p className="type-body">
            {coach.activeClientCount === 0
              ? 'Aktuell keine Kund:innen zugeordnet.'
              : `${coach.activeClientCount} aktuell zugeordnet.`}
          </p>
          {coach.activeClientCount > 0 && (
            <ButtonLink href={`/admin/kunden?coach=${coach.id}`} variant="secondary">
              Kund:innen anzeigen
            </ButtonLink>
          )}
          {coach.account.status === 'DISABLED' && coach.activeClientCount > 0 && (
            <p role="note" className="type-body-sm text-warning">
              Der Coach ist deaktiviert. Bitte die Kund:innen einem anderen Coach zuordnen.
            </p>
          )}
        </Card>
        <Card padding="md">
          <h2 className="type-title mb-4">Profil</h2>
          {user.permissions.includes('coaches.update') ? (
            <CoachProfileForm coach={coach} action={updateCoachAction.bind(null, coach.id)} />
          ) : (
            <p className="type-body-sm text-fg-muted">Keine Berechtigung zum Bearbeiten.</p>
          )}
        </Card>
        <Card padding="md">
          <h2 className="type-title mb-4">Konto</h2>
          <AccountControls
            account={coach.account}
            personName={coach.displayName}
            canManage={user.permissions.includes('coaches.account.manage')}
            setStatus={setCoachAccountAction.bind(null, coach.id)}
            regenerate={regenerateCoachActivationAction.bind(null, coach.id)}
          />
        </Card>
      </div>
    </div>
  );
}
