import type { Metadata } from 'next';
import {
  ACCOUNT_LABEL,
  ACTIVATION_LABEL,
  COACHING_LABEL,
  formatDate,
  formatDateTime,
} from '@/components/admin/management/labels';
import { Card } from '@/components/ui';
import { loadClient } from '@/lib/admin-data';

export const metadata: Metadata = { title: 'Kund:in' };

/** Overview: identity, coach, states and dates — no invented progress metrics before Training. */
export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadClient(id);
  if (!result.ok) return null;
  const client = result.data;
  const rows: [string, string][] = [
    ['E-Mail', client.email],
    ['Telefon', client.phone ?? '—'],
    ['Coach', client.coach?.displayName ?? 'Ohne Coach'],
    ['Zugeordnet seit', formatDate(client.assignedAt)],
    ['Coaching-Status', COACHING_LABEL[client.coachingStatus]],
    ['Konto', ACCOUNT_LABEL[client.account.status]],
    ['Aktivierung', ACTIVATION_LABEL[client.account.activation]],
    ['Letzte Anmeldung', formatDateTime(client.account.lastLoginAt)],
    ['Angelegt', formatDate(client.createdAt)],
  ];
  return (
    <div className="grid gap-6">
      <Card padding="md">
        <h2 className="type-title mb-4">Übersicht</h2>
        <dl className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="type-body-sm text-fg-muted">{label}</dt>
              <dd className="type-body break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {client.coachingStatus === 'COMPLETED' && (
        <p
          role="note"
          className="type-body-sm rounded-xs border border-border-subtle px-4 py-3 text-fg-muted"
        >
          Das Coaching ist abgeschlossen. Profil und Verlauf bleiben erhalten.
        </p>
      )}
      <Card padding="md">
        <h2 className="type-title mb-4">Coach-Verlauf</h2>
        {client.assignments.length === 0 ? (
          <p className="type-body-sm text-fg-muted">Bisher keinem Coach zugeordnet.</p>
        ) : (
          <ol className="grid gap-2">
            {client.assignments.map((entry) => (
              <li
                key={`${entry.coach.id}-${entry.assignedAt}`}
                className="type-body-sm flex flex-wrap gap-x-3"
              >
                <span className="text-fg">{entry.coach.displayName}</span>
                <span className="text-fg-muted">
                  {formatDate(entry.assignedAt)} –{' '}
                  {entry.endedAt ? formatDate(entry.endedAt) : 'heute'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
