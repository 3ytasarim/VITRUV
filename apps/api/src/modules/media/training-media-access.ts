import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { roleHasPermission } from '@vitruv/shared';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, eq, or, sql } from 'drizzle-orm';

/**
 * Sprint 8A — private training media (docs/ios-training-sprint8a-private-media.md).
 *
 * A PRIVATE training video/image is never reachable under a stable URL. API responses that are
 * already authorised (workout session, plan, template, library …) carry a SIGNED delivery URL
 *
 *   ${API_PUBLIC_URL}/v1/media/training/<assetId>?u=<viewerId>&e=<expiresUnix>&s=<signature>
 *
 * - signature = HMAC-SHA256(MEDIA_URL_SIGNING_KEY, "v1|<assetId>|<viewerId>|<expires>")
 *   → bound to ONE asset, ONE user and ONE expiry; changing any part invalidates it.
 * - the delivery route re-checks on every request that the user is still ACTIVE and still allowed
 *   to see the asset (a disabled client or a removed assignment stops a URL before it expires).
 * - expiry is rounded up to a window, so repeated reads within a window return the SAME URL
 *   (players and caches are not reset on every refresh) — lifetime is TTL … TTL + window.
 * - an expired URL is never accepted again; the app asks the renewal endpoint for a new one.
 * - the query string is never logged by the API (request log = path only).
 *
 * PUBLIC training assets (everything uploaded before the switch) keep their public URL — the
 * two-stage migration moves them later (plan in the private-media doc).
 */

const { mediaAssets: M } = schema;

export interface TrainingMediaSigner {
  /** Signed delivery URL for `viewerId`, or null for an invalid input. */
  sign(assetId: string, viewerId: string, nowMs?: number): { url: string; expiresAt: Date };
  /** The viewer id when the signature is valid and not expired; otherwise null. */
  verify(
    assetId: string,
    query: { u?: string; e?: string; s?: string },
    nowMs?: number,
  ): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/;

export const TRAINING_MEDIA_PATH = '/v1/media/training';

export function createTrainingMediaSigner(options: {
  /** ≥ 32 characters, from env (never logged). */
  key: string;
  /** Public base URL of the API (API_PUBLIC_URL). */
  apiBaseUrl: string;
  ttlSeconds: number;
}): TrainingMediaSigner {
  if (options.key.length < 32) throw new Error('MEDIA_URL_SIGNING_KEY is too short.');
  const base = options.apiBaseUrl.replace(/\/+$/, '');
  const window = Math.max(60, Math.floor(options.ttlSeconds / 4));
  const mac = (assetId: string, viewerId: string, expires: number) =>
    createHmac('sha256', options.key)
      .update(`v1|${assetId.toLowerCase()}|${viewerId.toLowerCase()}|${expires}`)
      .digest('base64url');

  return {
    sign(assetId, viewerId, nowMs = Date.now()) {
      if (!UUID.test(assetId) || !UUID.test(viewerId))
        throw new Error('Invalid media signature input.');
      const minimum = Math.floor(nowMs / 1000) + options.ttlSeconds;
      const expires = Math.ceil(minimum / window) * window;
      const query = new URLSearchParams({
        u: viewerId.toLowerCase(),
        e: String(expires),
        s: mac(assetId, viewerId, expires),
      });
      return {
        url: `${base}${TRAINING_MEDIA_PATH}/${assetId.toLowerCase()}?${query.toString()}`,
        expiresAt: new Date(expires * 1000),
      };
    },
    verify(assetId, query, nowMs = Date.now()) {
      const { u, e, s } = query;
      if (!u || !e || !s || !UUID.test(assetId) || !UUID.test(u) || !SIGNATURE.test(s)) return null;
      if (!/^\d{1,12}$/.test(e)) return null;
      const expires = Number(e);
      if (expires * 1000 <= nowMs) return null;
      // A far-future expiry can only come from a forged or foreign-key URL; refuse it early.
      if (expires * 1000 > nowMs + (options.ttlSeconds + window + 60) * 1000) return null;
      const expected = Buffer.from(mac(assetId, u, expires));
      const given = Buffer.from(s);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      return u.toLowerCase();
    },
  };
}

/**
 * Who is reading the current API response. Set once per authenticated request (app.ts) so the
 * DTO builders deep inside the services can sign URLs for exactly this user without threading
 * the principal through every function. Outside a request: no viewer → no private URL.
 */
const viewerContext = new AsyncLocalStorage<{ userId: string | null }>();

export function runWithMediaViewer<T>(userId: string | null, fn: () => T): T {
  return viewerContext.run({ userId }, fn);
}

export function currentMediaViewer(): string | null {
  return viewerContext.getStore()?.userId ?? null;
}

/**
 * May `userId` see the TRAINING asset `assetId` right now? One round trip per check.
 * - user must exist and be ACTIVE;
 * - ADMIN / COACH with `training.exercises.read`: yes (the training library is shared — the same
 *   rule as GET /v1/admin/training/media);
 * - CLIENT: only if the asset is referenced by one of their own session snapshots, an exercise
 *   row (own video or library video) of their ACTIVE program, an exercise of their plan, or a
 *   welcome video (shown to every client).
 * Everything else: no (the route answers 404/403 without telling which).
 */
export async function canViewTrainingAsset(
  db: DbExecutor,
  userId: string,
  assetId: string,
): Promise<boolean> {
  const [user] = await db
    .select({ role: schema.users.role, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || user.status !== 'ACTIVE') return false;
  if (user.role !== 'CLIENT') return roleHasPermission(user.role, 'training.exercises.read');
  if (!roleHasPermission('CLIENT', 'training.self.read')) return false;

  const {
    workoutSessions: WS,
    workoutSessionExercises: WSE,
    trainingPrograms: P,
    trainingWeeks: TW,
    trainingDays: TD,
    trainingSections: TS,
    trainingExerciseAssignments: TA,
    exercises: E,
    clientPlanItems: CPI,
    welcomeVideos: WV,
  } = schema;
  const [row] = await db
    .select({ ok: sql<number>`1` })
    .from(M)
    .where(
      and(
        eq(M.id, assetId),
        eq(M.purpose, 'TRAINING_VIDEO'),
        or(
          sql`exists (select 1 from ${WSE} join ${WS} on ${WS.id} = ${WSE.sessionId}
                where ${WS.clientUserId} = ${userId} and ${WSE.mediaAssetId} = ${M.id})`,
          sql`exists (select 1 from ${TA}
                join ${TS} on ${TS.id} = ${TA.sectionId}
                join ${TD} on ${TD.id} = ${TS.dayId}
                join ${TW} on ${TW.id} = ${TD.weekId}
                join ${P} on ${P.id} = ${TW.programId}
                join ${E} on ${E.id} = ${TA.exerciseId}
                where ${P.clientUserId} = ${userId} and ${P.status} = 'ACTIVE'
                  and coalesce(${TA.mediaAssetId}, ${E.mediaAssetId}) = ${M.id})`,
          sql`exists (select 1 from ${CPI} join ${E} on ${E.id} = ${CPI.exerciseId}
                where ${CPI.clientUserId} = ${userId} and ${E.mediaAssetId} = ${M.id})`,
          sql`exists (select 1 from ${WV} where ${WV.mediaAssetId} = ${M.id})`,
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}
