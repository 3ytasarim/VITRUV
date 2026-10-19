import type { AdminDashboard } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { COACHING_STATUSES } from '@vitruv/shared';
import { sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { clientAccessible } from '../management/management.service';
import type { TrainingDeps } from '../training/exercises.service';

/**
 * Coach/Admin dashboard read model (glass start page). Every query carries the client scope
 * (clientAccessible: ADMIN all clients, COACH only actively assigned ones) — the same rule as the
 * client list, so the start page can never show more than the rest of the panel. Read-only,
 * one consistent snapshot. Weeks: ISO weeks (Monday) in Europe/Berlin.
 */
const {
  workoutSessions: WS,
  workoutSessionExercises: WE,
  clientProfiles: CP,
  trainingPrograms: P,
} = schema;
const TZ = 'Europe/Berlin';

type Row = Record<string, unknown>;
const rows = async (tx: DbExecutor, query: ReturnType<typeof sql>) =>
  ((await tx.execute(query)) as unknown as { rows: Row[] }).rows;
const num = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => new Date(v as string).toISOString();
const name = (r: Row) => `${String(r.first_name ?? '')} ${String(r.last_name ?? '')}`.trim();

export async function adminDashboard(
  deps: TrainingDeps,
  actor: Principal,
): Promise<AdminDashboard> {
  return deps.db.transaction(
    async (tx) => {
      const scopeCP = clientAccessible(actor, CP.userId);
      const scopeWS = clientAccessible(actor, WS.clientUserId);

      const statusRows = await rows(
        tx,
        sql`select ${CP.coachingStatus} as status, count(*)::int as n from ${CP} where ${scopeCP} group by 1`,
      );
      const clientsByStatus = Object.fromEntries(
        COACHING_STATUSES.map((s) => [s, num(statusRows.find((r) => r.status === s)?.n)]),
      ) as AdminDashboard['clientsByStatus'];

      const [programs] = await rows(
        tx,
        sql`select count(*)::int as n from ${P} where ${P.status} = 'ACTIVE' and ${clientAccessible(actor, P.clientUserId)}`,
      );

      const weeks = await rows(
        tx,
        sql`with weeks as (
              select (date_trunc('week', now() at time zone ${TZ}) - make_interval(weeks => n))::date as wk
              from generate_series(0, 7) as n
            )
            select to_char(w.wk, 'YYYY-MM-DD') as wk, count(${WS.id})::int as n
            from weeks w
            left join ${WS}
              on date_trunc('week', ${WS.startedAt} at time zone ${TZ})::date = w.wk
             and ${WS.status} = 'COMPLETED'
             and ${scopeWS}
            group by w.wk
            order by w.wk`,
      );
      const sessionsPerWeek = weeks.map((r) => ({ weekStart: String(r.wk), count: num(r.n) }));

      // client notes = exercise notes + whole-session notes (each with its last edit time)
      const notesUnion = sql`(
          select ${WE.sessionId} as session_id, ${WE.exerciseNameSnapshot} as exercise_name,
                 ${WE.clientNote} as note, ${WE.clientNoteUpdatedAt} as at
          from ${WE} where ${WE.clientNote} is not null
          union all
          select ${WS.id}, null, ${WS.clientNote}, ${WS.clientNoteUpdatedAt}
          from ${WS} where ${WS.clientNote} is not null
        )`;
      const [noteCounts] = await rows(
        tx,
        sql`select
              count(*) filter (where n.at >= now() - interval '7 days')::int as last7,
              count(*) filter (where n.at < now() - interval '7 days' and n.at >= now() - interval '14 days')::int as prev7
            from ${notesUnion} n
            join ${WS} on ${WS.id} = n.session_id
            where ${scopeWS}`,
      );
      const recentNotes = await rows(
        tx,
        sql`select n.session_id, ${WS.clientUserId} as client_id, ${CP.firstName} as first_name,
                   ${CP.lastName} as last_name, n.exercise_name, left(n.note, 160) as excerpt, n.at
            from ${notesUnion} n
            join ${WS} on ${WS.id} = n.session_id
            join ${CP} on ${CP.userId} = ${WS.clientUserId}
            where ${scopeWS}
            order by n.at desc nulls last
            limit 6`,
      );
      const recentSessions = await rows(
        tx,
        sql`select ${WS.id} as session_id, ${WS.clientUserId} as client_id, ${CP.firstName} as first_name,
                   ${CP.lastName} as last_name, ${WS.dayTitleSnapshot} as day_title, ${WS.status} as status,
                   ${WS.startedAt} as started_at,
                   ((select count(*) from ${WE} where ${WE.sessionId} = ${WS.id} and ${WE.clientNote} is not null)
                     + (case when ${WS.clientNote} is not null then 1 else 0 end))::int as notes
            from ${WS}
            join ${CP} on ${CP.userId} = ${WS.clientUserId}
            where ${scopeWS}
            order by ${WS.startedAt} desc
            limit 6`,
      );

      const thisWeek = sessionsPerWeek.at(-1)?.count ?? 0;
      const lastWeek = sessionsPerWeek.at(-2)?.count ?? 0;
      return {
        kpis: {
          activeClients: clientsByStatus.ACTIVE,
          totalClients: Object.values(clientsByStatus).reduce((a, b) => a + b, 0),
          activePrograms: num(programs?.n),
          sessionsThisWeek: thisWeek,
          sessionsLastWeek: lastWeek,
          notesLast7Days: num(noteCounts?.last7),
          notesPrevious7Days: num(noteCounts?.prev7),
        },
        sessionsPerWeek,
        clientsByStatus,
        recentNotes: recentNotes.map((r) => ({
          sessionId: String(r.session_id),
          clientId: String(r.client_id),
          clientName: name(r),
          exerciseName: r.exercise_name === null ? null : String(r.exercise_name),
          excerpt: String(r.excerpt ?? ''),
          at: iso(r.at),
        })),
        recentSessions: recentSessions.map((r) => ({
          sessionId: String(r.session_id),
          clientId: String(r.client_id),
          clientName: name(r),
          dayTitle: String(r.day_title),
          status: r.status as AdminDashboard['recentSessions'][number]['status'],
          startedAt: iso(r.started_at),
          notesCount: num(r.notes),
        })),
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
