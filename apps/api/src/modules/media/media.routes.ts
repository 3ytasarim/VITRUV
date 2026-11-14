import { mediaListQuerySchema, updateMediaRequestSchema } from '@vitruv/contracts';
import { mediaUploadMaxBodyBytes } from '@vitruv/shared';
import { Hono } from 'hono';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { assertSafeStorageKey, type ObjectStorage } from '../../infra/storage/index';
import { AppError } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import type { Permission } from '@vitruv/shared';
import {
  deleteLibraryMedia,
  getLibraryMedia,
  listLibraryMedia,
  updateLibraryMedia,
  uploadStagedLibraryMedia,
  type MediaLibrary,
  type MediaServiceDeps,
} from './media.service';
import { receiveMultipartUpload } from './upload-receiver';

const idParams = z.object({ id: z.uuid() });

/** Defaults when the app is built without explicit upload settings (tests, tooling). */
export const DEFAULT_UPLOAD_SETTINGS = {
  tmpDir: join(tmpdir(), 'vitruv-uploads'),
  maxConcurrent: 4,
} as const;

/** Website media library API — mounted at /v1/admin/media (ADMIN: website.media.*). */
export function adminMediaRoutes(deps: MediaServiceDeps) {
  return mediaLibraryRoutes(deps, 'WEBSITE', {
    read: 'website.media.read',
    write: 'website.media.write',
    delete: 'website.media.delete',
  });
}

/**
 * Training media library API — mounted at /v1/admin/training/media. Same service, storage and
 * validation as the website library; only exercise demonstration media (purpose TRAINING_VIDEO).
 */
export function trainingMediaRoutes(deps: MediaServiceDeps) {
  return mediaLibraryRoutes(deps, 'TRAINING', {
    read: 'training.exercises.read',
    write: 'training.exercises.write',
    delete: 'training.media.delete',
  });
}

function mediaLibraryRoutes(
  deps: MediaServiceDeps,
  library: MediaLibrary,
  permissions: { read: Permission; write: Permission; delete: Permission },
) {
  const routes = new Hono<AppEnv>();
  const uploads = deps.uploads ?? DEFAULT_UPLOAD_SETTINGS;
  let activeUploads = 0;
  routes.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get(
    '/',
    requirePermission(permissions.read),
    validate('query', mediaListQuerySchema),
    async (c) => c.json({ items: await listLibraryMedia(deps, library, c.req.valid('query')) }),
  );

  routes.get('/:id', requirePermission(permissions.read), validate('param', idParams), async (c) =>
    c.json(await getLibraryMedia(deps, library, c.req.valid('param').id)),
  );

  routes.post(
    '/',
    requirePermission(permissions.write),
    // Streaming upload (the global API body limit is skipped for this route only): the body is
    // counted and limited while it streams to a temp file — never buffered in memory.
    async (c) => {
      const principal = c.get('principal');
      if (!principal) throw AppError.unauthenticated();
      // Each upload holds a temp file + a storage stream: cap parallel uploads per process.
      if (activeUploads >= uploads.maxConcurrent) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Zu viele gleichzeitige Uploads. Bitte kurz warten und erneut versuchen.',
        );
      }
      activeUploads += 1;
      try {
        const staged = await receiveMultipartUpload(c.req.raw, {
          tmpDir: uploads.tmpDir,
          maxFileBytes: Math.max(deps.limits.IMAGE, deps.limits.VIDEO),
          maxBodyBytes: mediaUploadMaxBodyBytes(deps.limits),
          fieldNames: ['altText'],
        });
        try {
          const asset = await uploadStagedLibraryMedia(deps, library, {
            staged,
            altText: staged.fields.altText?.slice(0, 300) ?? null,
            userId: principal.userId,
          });
          return c.json(asset, 201);
        } finally {
          await staged.discard();
        }
      } finally {
        activeUploads -= 1;
      }
    },
  );

  routes.patch(
    '/:id',
    requirePermission(permissions.write),
    validate('param', idParams),
    validate('json', updateMediaRequestSchema),
    async (c) =>
      c.json(await updateLibraryMedia(deps, library, c.req.valid('param').id, c.req.valid('json'))),
  );

  routes.delete(
    '/:id',
    requirePermission(permissions.delete),
    validate('param', idParams),
    async (c) => {
      await deleteLibraryMedia(deps, library, c.req.valid('param').id);
      return c.body(null, 204);
    },
  );

  return routes;
}

export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match) return null;
  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

/**
 * Delivery of PUBLIC objects at /media/<key> — for BOTH drivers, so existing
 * `${API_PUBLIC_URL}/media/public/…` URLs keep working after the move to S3.
 * Streams the object (no full buffering) and supports HTTP Range (206) for video seeking.
 * Only keys under `public/` are served; private objects are never reachable here.
 * With PUBLIC_MEDIA_BASE_URL set, new URLs point at the CDN/bucket directly and this route
 * only serves older links.
 */
export function mediaDeliveryRoutes(storage: ObjectStorage) {
  const routes = new Hono<AppEnv>();

  routes.get('/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ''));
    try {
      assertSafeStorageKey(key);
    } catch {
      throw AppError.notFound();
    }
    if (!key.startsWith('public/')) throw AppError.notFound();
    const head = await storage.head(key, 'PUBLIC');
    if (!head) throw AppError.notFound();

    const size = head.sizeBytes;
    c.header('Content-Type', head.contentType ?? 'application/octet-stream');
    c.header('Content-Disposition', 'inline');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    c.header('Accept-Ranges', 'bytes');
    // Media is embedded by the website (another origin); never executed.
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
    const object = await storage.getStream(key, 'PUBLIC', range ?? undefined);
    if (!object) throw AppError.notFound();
    if (range) {
      c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      c.header('Content-Length', String(range.end - range.start + 1));
      return c.body(object.body, 206);
    }
    c.header('Content-Length', String(size));
    return c.body(object.body, 200);
  });

  return routes;
}

/** @deprecated name kept for older imports — the route now serves every driver. */
export const localMediaDeliveryRoutes = mediaDeliveryRoutes;
