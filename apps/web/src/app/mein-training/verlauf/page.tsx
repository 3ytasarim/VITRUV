import type { Metadata } from 'next';
import { ErrorState } from '@/components/admin/states';
import { SessionList } from '@/components/portal/session-list';
import { portalApi } from '@/lib/portal-api';

export const metadata: Metadata = { title: 'Verlauf' };

/** All own sessions (newest first, up to 100) — each opens the session with its notes. */
export default async function PortalHistoryPage() {
  const history = await portalApi.history(100);
  return (
    <>
      <div className="vt-phead">
        <p className="type-eyebrow text-accent-text">Verlauf</p>
        <h1 className="vt-phead__title">Deine Einheiten</h1>
        <p className="type-body text-fg-muted">
          Jede Einheit mit deinen Notizen. Notizen kannst du auch nachträglich ergänzen.
        </p>
      </div>
      {!history.ok ? (
        <ErrorState message="Dein Verlauf konnte nicht geladen werden." />
      ) : history.data.items.length === 0 ? (
        <div className="vt-pcard">
          <p className="type-body text-fg-muted">
            Noch keine Einheit – starte dein erstes Training im Trainingsplan.
          </p>
        </div>
      ) : (
        <div className="vt-pcard vt-pcard--flush">
          <SessionList items={history.data.items} />
        </div>
      )}
    </>
  );
}
