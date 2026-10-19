import type { ClientPlan, SaveClientPlanRequest } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { Principal } from '../../auth/principal';
import { AppError } from '../../lib/errors';
import { recordEvent } from '../auth/auth.service';
import { clientAccessible } from '../management/management.service';
import type { TrainingDeps } from './exercises.service';

/**
 * Dated client plan (owner request 2026-10-19): a flat list of exercises with a period (from – to)
 * and a note
 * the client sees. The coach saves the WHOLE list at once (replace in one transaction).
 *
 * OBJECT SCOPE: coach/admin access goes through clientAccessible() in SQL (ADMIN: all clients;
 * COACH: actively assigned clients); out of scope = the same 404 as a missing client. The client
 * reads only their own plan (self context — the id never comes from the request).
 */
const { clientPlanItems: P, exercises: E, mediaAssets: M, users } = schema;

const notFound = () => AppError.notFound('Not found.');

async function requireClient(db: DbExecutor, actor: Principal, clientId: string) {
  const [client] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, clientId), eq(users.role, 'CLIENT'), clientAccessible(actor, users.id)))
    .limit(1);
  if (!client) throw notFound();
}

async function readPlan(deps: TrainingDeps, clientId: string): Promise<ClientPlan> {
  const rows = await deps.db
    .select({ item: P, exercise: E, asset: M })
    .from(P)
    .innerJoin(E, eq(E.id, P.exerciseId))
    .leftJoin(M, eq(M.id, E.mediaAssetId))
    .where(eq(P.clientUserId, clientId))
    .orderBy(asc(P.scheduledOn), asc(P.sortOrder));
  const [last] = await deps.db
    .select({ at: max(P.updatedAt) })
    .from(P)
    .where(eq(P.clientUserId, clientId));
  return {
    items: rows.map(({ item, exercise, asset }) => ({
      id: item.id,
      scheduledOn: item.scheduledOn,
      endsOn: item.endsOn,
      note: item.note,
      exercise: {
        id: exercise.id,
        name: exercise.name,
        description: exercise.description,
        active: exercise.active,
        media:
          asset && (asset.kind === 'IMAGE' || asset.kind === 'VIDEO')
            ? {
                assetId: asset.id,
                kind: asset.kind,
                url: deps.urls.publicUrl(asset.storageKey),
                fileName: asset.fileName,
              }
            : null,
      },
    })),
    updatedAt: last?.at ? last.at.toISOString() : null,
  };
}

/** Coach/Admin: the plan of a client in scope. */
export async function clientPlan(deps: TrainingDeps, actor: Principal, clientId: string) {
  await requireClient(deps.db, actor, clientId);
  return readPlan(deps, clientId);
}

/**
 * Coach/Admin: replaces the client's plan with `input.items` (list order = order within a day).
 * Every exercise must exist; an exercise that is inactive may stay if it was already planned,
 * but cannot be newly added.
 */
export async function saveClientPlan(
  deps: TrainingDeps,
  actor: Principal,
  clientId: string,
  input: SaveClientPlanRequest,
): Promise<ClientPlan> {
  await deps.db.transaction(async (tx) => {
    await requireClient(tx, actor, clientId);
    // one save per client at a time (two coaches saving concurrently cannot interleave)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vitruv.plan:${clientId}`}))`);

    const ids = [...new Set(input.items.map((i) => i.exerciseId))];
    const found = ids.length
      ? await tx.select({ id: E.id, active: E.active }).from(E).where(inArray(E.id, ids))
      : [];
    const known = new Map(found.map((e) => [e.id, e.active]));
    const planned = new Set(
      (await tx.select({ id: P.exerciseId }).from(P).where(eq(P.clientUserId, clientId))).map(
        (r) => r.id,
      ),
    );
    const details = input.items.flatMap((item, index) => {
      const active = known.get(item.exerciseId);
      if (active === undefined) {
        return [{ path: `items.${index}.exerciseId`, message: 'Übung nicht gefunden.' }];
      }
      if (!active && !planned.has(item.exerciseId)) {
        return [{ path: `items.${index}.exerciseId`, message: 'Diese Übung ist deaktiviert.' }];
      }
      return [];
    });
    if (details.length > 0) throw AppError.validation(details, 'Plan enthält ungültige Übungen.');

    await tx.delete(P).where(eq(P.clientUserId, clientId));
    if (input.items.length > 0) {
      await tx.insert(P).values(
        input.items.map((item, index) => ({
          clientUserId: clientId,
          exerciseId: item.exerciseId,
          scheduledOn: item.scheduledOn,
          // a period that ends on its first day is stored as a single day
          endsOn: item.endsOn && item.endsOn !== item.scheduledOn ? item.endsOn : null,
          note: item.note?.trim() ? item.note.trim() : null,
          sortOrder: index,
          createdByUserId: actor.userId,
        })),
      );
    }
    await recordEvent(tx, 'CLIENT_PLAN_SAVED', { userId: clientId, actorUserId: actor.userId });
  });
  return readPlan(deps, clientId);
}

/** Client (self context): the own plan. */
export function ownPlan(deps: TrainingDeps, actor: Principal) {
  return readPlan(deps, actor.userId);
}
