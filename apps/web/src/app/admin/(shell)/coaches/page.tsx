import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDate } from '@/components/admin/management/labels';
import { AccountBadge } from '@/components/admin/management/status-badges';
import { AdminPageHeader, EmptyState, ErrorState } from '@/components/admin/states';
import { ButtonLink, Card } from '@/components/ui';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Coaches' };

/** ADMIN: coach accounts with activation/account state and the number of assigned clients. */
export default async function CoachesPage() {
  const user = await requirePagePermission('coaches.read', '/admin/coaches');
  const result = await adminApi.coaches();
  return (
    <>
      <AdminPageHeader
        title="Coaches"
        description="Interne Coach-Konten. Öffentliche Texte über das Team bleiben im Website-CMS."
        actions={
          user.permissions.includes('coaches.create') ? (
            <ButtonLink href="/admin/coaches/neu" variant="primary" icon={<Plus aria-hidden />}>
              Coach anlegen
            </ButtonLink>
          ) : undefined
        }
      />
      {!result.ok ? (
        <ErrorState message="Die Coaches konnten nicht geladen werden." />
      ) : result.data.items.length === 0 ? (
        <EmptyState title="Noch keine Coaches">
          Bisher gibt es nur die Administration. Lege einen Coach an, um Kund:innen zuzuordnen.
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Coaches">
          {result.data.items.map((coach) => (
            <li key={coach.id}>
              <Card padding="sm" className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-0 flex-[1_1_16rem]">
                  <Link
                    href={`/admin/coaches/${coach.id}`}
                    className="type-title block truncate after:absolute after:inset-0 hover:text-accent-text"
                  >
                    {coach.displayName}
                  </Link>
                  <p className="type-body-sm truncate text-fg-muted">{coach.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AccountBadge account={coach.account} />
                </div>
                <dl className="type-body-sm grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-fg-muted">
                  <dt>Kund:innen</dt>
                  <dd className="text-fg">{coach.activeClientCount}</dd>
                  <dt>Angelegt</dt>
                  <dd className="text-fg">{formatDate(coach.createdAt)}</dd>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
