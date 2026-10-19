import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccountBadge, CoachingBadge } from '@/components/admin/management/status-badges';
import { WorkspaceTabs } from '@/components/admin/management/workspace-tabs';
import { ErrorState } from '@/components/admin/states';
import { loadClient } from '@/lib/admin-data';
import { requirePagePermission } from '@/lib/auth/session';

/**
 * Client workspace — later sprints attach Training, Ernährung, Check-ins, Feedback and
 * Nachrichten here (same client id = users.id).
 */
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePagePermission('clients.read', `/admin/kunden/${id}`);
  const result = await loadClient(id);
  if (!result.ok) return <ErrorState message="Die Kund:in konnte nicht geladen werden." />;
  const client = result.data;
  const base = `/admin/kunden/${client.id}`;
  return (
    <div className="vt-client-ws max-w-measure-display">
      <Link
        href="/admin/kunden"
        className="type-caption mb-4 inline-flex min-h-12 items-center gap-2 text-fg-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" /> Alle Kund:innen
      </Link>
      <header className="mb-6 flex flex-col gap-3">
        <h1 className="type-h2 break-words">
          {client.firstName} {client.lastName}
        </h1>
        <div className="flex flex-wrap gap-2">
          <CoachingBadge status={client.coachingStatus} />
          <AccountBadge account={client.account} />
        </div>
      </header>
      <WorkspaceTabs
        label="Bereiche der Kund:in"
        tabs={[
          { href: base, label: 'Übersicht' },
          { href: `${base}/profil`, label: 'Profil' },
          { href: `${base}/konto`, label: 'Konto' },
          ...(user.permissions.includes('training.programs.read')
            ? [{ href: `${base}/training`, label: 'Training', prefix: true }]
            : []),
          ...(user.permissions.includes('nutrition.documents.read')
            ? [{ href: `${base}/ernaehrung`, label: 'Ernährung' }]
            : []),
        ]}
        upcoming={['Check-ins', 'Feedback', 'Nachrichten']}
      />
      {children}
    </div>
  );
}
