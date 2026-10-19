import { Badge, Card } from '@/components/ui';
import { api } from '@/lib/api';

// Always render at request time: this page reports live system status.
export const dynamic = 'force-dynamic';

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <Card padding="sm" className="flex items-center justify-between gap-4">
      <div>
        <p className="type-title">{label}</p>
        <p className="type-body-sm mt-1 text-fg-muted">{detail}</p>
      </div>
      <Badge tone={ok ? 'success' : 'error'} dot>
        {ok ? 'OK' : 'Fehler'}
      </Badge>
    </Card>
  );
}

export const metadata = { title: 'Systemstatus' };

export default async function SystemStatusPage() {
  const [health, db] = await Promise.all([api.health(), api.databaseHealth()]);

  return (
    <div className="max-w-measure-display">
      <h1 className="type-h2">Systemstatus</h1>
      <p className="type-body mt-3 text-fg-muted">Erreichbarkeit von API und Datenbank.</p>
      <div className="mt-8 grid gap-3">
        <StatusRow
          label="API"
          ok={health?.status === 'ok'}
          detail={health ? `Version ${health.version}` : 'Nicht erreichbar'}
        />
        <StatusRow
          label="Datenbank"
          ok={db?.status === 'ok'}
          detail={db?.status === 'ok' ? `Antwortzeit ${db.latencyMs} ms` : 'Nicht erreichbar'}
        />
      </div>
    </div>
  );
}
