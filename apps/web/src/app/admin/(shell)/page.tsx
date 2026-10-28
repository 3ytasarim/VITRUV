import type { AdminDashboard } from '@vitruv/contracts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ClipboardList,
  MessageSquareText,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { formatDateTime } from '@/components/admin/management/labels';
import { ErrorState } from '@/components/admin/states';
import { Greeting } from '@/components/portal/greeting';
import { CountUp } from '@/components/portal/count-up';
import { adminApi } from '@/lib/admin-api';
import { requirePagePermission } from '@/lib/auth/session';
import { WORKOUT_STATUS_LABEL } from '@/lib/training-format';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<keyof AdminDashboard['clientsByStatus'], string> = {
  ACTIVE: 'Aktiv',
  PAUSED: 'Pausiert',
  COMPLETED: 'Abgeschlossen',
};
/** Monochrome donut shades (glass theme): white → grey. */
const SHADE: Record<keyof AdminDashboard['clientsByStatus'], number> = {
  ACTIVE: 92,
  PAUSED: 55,
  COMPLETED: 28,
};

function Trend({ now, before }: { now: number; before: number }) {
  if (now === before) return <span className="vt-dtrend">±0</span>;
  const up = now > before;
  const pct = before === 0 ? null : Math.round(((now - before) / before) * 100);
  return (
    <span className="vt-dtrend" data-up={up || undefined}>
      {up ? (
        <ArrowUpRight aria-hidden className="size-3.5" />
      ) : (
        <ArrowDownRight aria-hidden className="size-3.5" />
      )}
      {pct === null ? `+${now - before}` : `${pct > 0 ? '+' : ''}${pct} %`}
      <span className="sr-only">{up ? 'mehr' : 'weniger'} als zuvor</span>
    </span>
  );
}

function Kpi({
  i,
  href,
  icon,
  label,
  value,
  hint,
  trend,
}: {
  i: number;
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  trend?: ReactNode;
}) {
  return (
    <Link href={href} className="vt-dkpi vt-glass" style={{ '--i': i } as CSSProperties}>
      <span className="flex items-start justify-between gap-3">
        <span className="type-body-sm font-semibold">{label}</span>
        <span aria-hidden className="vt-dkpi__go">
          {icon}
        </span>
      </span>
      <span className="mt-auto flex items-end justify-between gap-3 pt-8">
        <span className="flex flex-col gap-1">
          <span className="vt-dkpi__value">
            <CountUp value={value} />
          </span>
          <span className="type-caption text-fg-subtle">{hint}</span>
        </span>
        {trend}
      </span>
    </Link>
  );
}

/**
 * Coach/Admin start page (glass dashboard, template "glassy CRM dashboard", monochrome): greeting,
 * four KPIs with week-over-week trends, completed sessions per week (bar chart), clients by
 * coaching status (donut), the latest client notes and sessions. All numbers come from
 * GET /v1/admin/dashboard, scoped by the API (COACH: own clients only).
 */
export default async function AdminDashboardPage() {
  const user = await requirePagePermission('clients.read', '/admin');
  const result = await adminApi.dashboard();
  if (!result.ok) return <ErrorState message="Das Dashboard konnte nicht geladen werden." />;
  const d = result.data;
  const first = (user.displayName ?? '').split(' ')[0] || 'Admin';
  const max = Math.max(1, ...d.sessionsPerWeek.map((w) => w.count));
  const total = Math.max(1, d.kpis.totalClients);
  let acc = 0;
  const segments = (Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((status) => {
    const n = d.clientsByStatus[status];
    const from = acc / total;
    acc += n;
    return { status, n, from, to: acc / total };
  });
  const donut = `conic-gradient(${segments
    .map(
      (s) =>
        `color-mix(in srgb, var(--glass-hi) ${SHADE[s.status]}%, transparent) ${(s.from * 360).toFixed(1)}deg ${(s.to * 360).toFixed(1)}deg`,
    )
    .join(', ')})`;
  const weekLabel = (iso: string) =>
    new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' }).format(new Date(iso));

  return (
    <div className="vt-dash">
      <div className="vt-dash__head">
        <Greeting name={first} />
        <p className="type-body text-fg-muted">Das passiert gerade bei deinen Kund:innen.</p>
      </div>

      <div className="vt-dash__kpis">
        <Kpi
          i={0}
          href="/admin/kunden"
          icon={<Users className="size-4" />}
          label="Aktive Kund:innen"
          value={d.kpis.activeClients}
          hint={`von ${d.kpis.totalClients} insgesamt`}
        />
        <Kpi
          i={1}
          href="/admin/kunden"
          icon={<ClipboardList className="size-4" />}
          label="Aktive Trainingspläne"
          value={d.kpis.activePrograms}
          hint="laufen gerade"
        />
        <Kpi
          i={2}
          href="/admin/kunden"
          icon={<CalendarCheck className="size-4" />}
          label="Einheiten diese Woche"
          value={d.kpis.sessionsThisWeek}
          hint={`Vorwoche: ${d.kpis.sessionsLastWeek}`}
          trend={<Trend now={d.kpis.sessionsThisWeek} before={d.kpis.sessionsLastWeek} />}
        />
        <Kpi
          i={3}
          href="#notizen"
          icon={<MessageSquareText className="size-4" />}
          label="Neue Notizen"
          value={d.kpis.notesLast7Days}
          hint="letzte 7 Tage"
          trend={<Trend now={d.kpis.notesLast7Days} before={d.kpis.notesPrevious7Days} />}
        />
      </div>

      <div className="vt-dash__charts">
        <section className="vt-glass vt-dpanel" aria-labelledby="dash-weeks">
          <div className="vt-dpanel__head">
            <h2 id="dash-weeks" className="vt-dpanel__title">
              Trainingseinheiten
            </h2>
            <span className="type-caption text-fg-subtle">abgeschlossen · letzte 8 Wochen</span>
          </div>
          <ol className="vt-dbars" aria-label="Abgeschlossene Einheiten pro Woche">
            {d.sessionsPerWeek.map((w, i) => (
              <li
                key={w.weekStart}
                style={{ '--h': w.count / max, '--i': i } as CSSProperties}
                data-now={i === d.sessionsPerWeek.length - 1 || undefined}
              >
                <span className="vt-dbars__value">{w.count}</span>
                <span aria-hidden className="vt-dbars__bar" />
                <span className="vt-dbars__label">
                  <span className="sr-only">Woche ab </span>
                  {weekLabel(w.weekStart)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="vt-glass vt-dpanel" aria-labelledby="dash-status">
          <div className="vt-dpanel__head">
            <h2 id="dash-status" className="vt-dpanel__title">
              Kund:innen nach Status
            </h2>
          </div>
          <div className="vt-ddonut">
            <div
              className="vt-ddonut__ring"
              style={{ background: d.kpis.totalClients ? donut : undefined }}
              role="img"
              aria-label={segments.map((s) => `${STATUS_LABEL[s.status]}: ${s.n}`).join(', ')}
            >
              <span className="vt-ddonut__total">
                <CountUp value={d.kpis.totalClients} />
                <span className="type-caption text-fg-subtle">gesamt</span>
              </span>
            </div>
            <ul className="vt-ddonut__legend">
              {segments.map((s) => (
                <li key={s.status}>
                  <span
                    aria-hidden
                    className="vt-ddonut__dot"
                    style={{
                      background: `color-mix(in srgb, var(--glass-hi) ${SHADE[s.status]}%, transparent)`,
                    }}
                  />
                  <span className="flex-1">{STATUS_LABEL[s.status]}</span>
                  <span className="tabular-nums text-fg-muted">{s.n}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className="vt-dash__lists">
        <section id="notizen" className="vt-glass vt-dpanel" aria-labelledby="dash-notes">
          <div className="vt-dpanel__head">
            <h2 id="dash-notes" className="vt-dpanel__title">
              Neueste Notizen
            </h2>
          </div>
          {d.recentNotes.length === 0 ? (
            <p className="type-body-sm text-fg-subtle">Noch keine Notizen von Kund:innen.</p>
          ) : (
            <ul className="vt-dlist">
              {d.recentNotes.map((n, i) => (
                <li key={`${n.sessionId}-${i}`}>
                  <Link
                    href={`/admin/kunden/${n.clientId}/training/einheit/${n.sessionId}`}
                    className="vt-dlist__row"
                  >
                    <span aria-hidden className="vt-dlist__avatar">
                      {n.clientName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="type-body-sm block font-semibold">
                        {n.clientName}
                        <span className="font-normal text-fg-subtle">
                          {' · '}
                          {n.exerciseName ?? 'ganzes Training'}
                        </span>
                      </span>
                      <span className="type-body-sm block truncate text-fg-muted">
                        „{n.excerpt}“
                      </span>
                    </span>
                    <time className="type-caption shrink-0 text-fg-subtle" dateTime={n.at}>
                      {formatDateTime(n.at)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="vt-glass vt-dpanel" aria-labelledby="dash-sessions">
          <div className="vt-dpanel__head">
            <h2 id="dash-sessions" className="vt-dpanel__title">
              Letzte Einheiten
            </h2>
          </div>
          {d.recentSessions.length === 0 ? (
            <p className="type-body-sm text-fg-subtle">Noch keine Trainingseinheiten.</p>
          ) : (
            <ul className="vt-dlist">
              {d.recentSessions.map((s) => (
                <li key={s.sessionId}>
                  <Link
                    href={`/admin/kunden/${s.clientId}/training/einheit/${s.sessionId}`}
                    className="vt-dlist__row"
                  >
                    <span aria-hidden className="vt-dlist__avatar">
                      {s.clientName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="type-body-sm block font-semibold">{s.clientName}</span>
                      <span className="type-body-sm block truncate text-fg-muted">
                        {s.dayTitle} · {WORKOUT_STATUS_LABEL[s.status]}
                        {s.notesCount > 0
                          ? ` · ${s.notesCount === 1 ? '1 Notiz' : `${s.notesCount} Notizen`}`
                          : ''}
                      </span>
                    </span>
                    <time className="type-caption shrink-0 text-fg-subtle" dateTime={s.startedAt}>
                      {formatDateTime(s.startedAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
