import type { TrainingMediaUrl } from '@vitruv/contracts';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import type { ObjectStorage } from '../../infra/storage/index';
import { AppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import type { MediaUrlResolver } from './media-url';
import { parseRange } from './media.routes';
import { canViewTrainingAsset, type TrainingMediaSigner } from './training-media-access';

/**
 * Sprint 8A — delivery + renewal of PRIVATE training media (training-media-access.ts).
 *
 *   GET|HEAD /v1/media/training/:assetId?u&e&s   signed delivery (no bearer: AVPlayer / <video>
 *                                                cannot send one). HTTP Range → 206.
 *   GET /v1/client/training/media/:assetId/url    fresh URL for the signed-in client
 *   GET /v1/admin/training/media/:assetId/url     fresh URL for coach/admin
 */
export interface TrainingMediaDeps {
  db: DbExecutor;
  storage: ObjectStorage;
  urls: MediaUrlResolver;
  logger: Logger;
  /** Absent = signing not configured: every signed request is refused. */
  signer?: TrainingMediaSigner;
  now?: () => number;
}

const assetParams = z.object({ assetId: z.uuid() });
const { mediaAssets: M } = schema;

async function trainingAsset(db: DbExecutor, assetId: string) {
  const [asset] = await db
    .select({
      id: M.id,
      kind: M.kind,
      storageKey: M.storageKey,
      visibility: M.visibility,
      purpose: M.purpose,
      mimeType: M.mimeType,
    })
    .from(M)
    .where(and(eq(M.id, assetId), eq(M.purpose, 'TRAINING_VIDEO')))
    .limit(1);
  return asset && asset.kind !== 'DOCUMENT' ? asset : null;
}

/** Answer for an invalid, foreign or expired URL — one message, the app simply renews. */
const expired = () =>
  new AppError(403, 'MEDIA_URL_EXPIRED', 'Der Medien-Link ist abgelaufen oder ungültig.');

export function trainingMediaDeliveryRoutes(deps: TrainingMediaDeps) {
  const routes = new Hono<AppEnv>();

  routes.on(['GET', 'HEAD'], '/:assetId', async (c) => {
    // Never cached anywhere: the URL is personal and short-lived.
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    const parsed = assetParams.safeParse(c.req.param());
    if (!parsed.success || !deps.signer) throw expired();
    const { assetId } = parsed.data;
    const now = (deps.now ?? Date.now)();
    const viewer = deps.signer.verify(
      assetId,
      { u: c.req.query('u'), e: c.req.query('e'), s: c.req.query('s') },
      now,
    );
    // Signature first: a forged URL costs no database query.
    if (!viewer) throw expired();
    const asset = await trainingAsset(deps.db, assetId);
    if (!asset || asset.visibility !== 'PRIVATE') throw AppError.notFound();
    // Re-checked on EVERY request (also each Range request): disabled users and removed
    // assignments stop working before the URL expires.
    if (!(await canViewTrainingAsset(deps.db, viewer, assetId))) throw AppError.notFound();

    const expiresAtSeconds = Number(c.req.query('e'));
    const remaining = Math.max(10, Math.min(600, expiresAtSeconds - Math.floor(now / 1000)));
    const redirect = await deps.storage.signedUrl(asset.storageKey, 'PRIVATE', {
      expiresInSeconds: remaining,
      contentType: asset.mimeType,
      contentDisposition: 'inline',
    });
    if (redirect) {
      // S3: the provider serves the bytes (Range works on presigned GETs); the presigned URL
      // never outlives this signed URL.
      return c.redirect(redirect, 302);
    }
    return streamPrivate(c, deps.storage, asset.storageKey);
  });

  return routes;
}

/** Local driver: stream with Range support (same rules as the public /media route). */
async function streamPrivate(c: Context<AppEnv>, storage: ObjectStorage, key: string) {
  const head = await storage.head(key, 'PRIVATE');
  if (!head) throw AppError.notFound();
  const size = head.sizeBytes;
  c.header('Content-Type', head.contentType ?? 'application/octet-stream');
  c.header('Content-Disposition', 'inline');
  c.header('Accept-Ranges', 'bytes');
  // Played by the web admin (other origin) and the app; never executed.
  c.header('Cross-Origin-Resource-Policy', 'cross-origin');
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");
  const rangeHeader = c.req.header('Range');
  const range = parseRange(rangeHeader, size);
  if (rangeHeader && !range) {
    c.header('Content-Range', `bytes */${size}`);
    return c.body(null, 416);
  }
  if (c.req.method === 'HEAD') {
    c.header('Content-Length', String(size));
    return c.body(null, 200);
  }
  const object = await storage.getStream(key, 'PRIVATE', range ?? undefined);
  if (!object) throw AppError.notFound();
  if (range) {
    c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    c.header('Content-Length', String(range.end - range.start + 1));
    return c.body(object.body, 206);
  }
  c.header('Content-Length', String(size));
  return c.body(object.body, 200);
}

async function freshUrl(
  deps: TrainingMediaDeps,
  viewer: string,
  assetId: string,
): Promise<TrainingMediaUrl> {
  const asset = await trainingAsset(deps.db, assetId);
  if (!asset || !(await canViewTrainingAsset(deps.db, viewer, assetId))) throw AppError.notFound();
  if (asset.visibility === 'PUBLIC') {
    return { assetId, url: deps.urls.publicUrl(asset.storageKey), expiresAt: null };
  }
  if (!deps.signer) {
    deps.logger.warn({ assetId }, 'private training media requested but signing is not configured');
    throw AppError.notFound();
  }
  const signed = deps.signer.sign(assetId, viewer, (deps.now ?? Date.now)());
  return { assetId, url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}

function renewalRoutes(
  deps: TrainingMediaDeps,
  permission: 'training.self.read' | 'training.exercises.read',
) {
  const routes = new Hono<AppEnv>();
  routes.get(
    '/:assetId/url',
    requirePermission(permission),
    validate('param', assetParams),
    async (c) => {
      const principal = c.get('principal');
      if (!principal) throw AppError.unauthenticated();
      return c.json(await freshUrl(deps, principal.userId, c.req.valid('param').assetId));
    },
  );
  return routes;
}

/** Mounted at /v1/client/training/media. */
export const clientTrainingMediaRoutes = (deps: TrainingMediaDeps) =>
  renewalRoutes(deps, 'training.self.read');

/** Mounted at /v1/admin/training/media (next to the library routes). */
export const adminTrainingMediaUrlRoutes = (deps: TrainingMediaDeps) =>
  renewalRoutes(deps, 'training.exercises.read');
