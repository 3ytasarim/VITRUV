import { mediaListQuerySchema, updateMediaRequestSchema } from '@vitruv/contracts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { assertSafeStorageKey, type ObjectStorage } from '../../infra/storage/index';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import type { Permission } from '@vitruv/shared';
import {
  deleteLibraryMedia,
  getLibraryMedia,
  listLibraryMedia,
  updateLibraryMedia,
  uploadLibraryMedia,
  type MediaLibrary,
  type MediaServiceDeps,
} from './media.service';

const idParams = z.object({ id: z.uuid() });

/** Multipart overhead allowance on top of the largest file. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

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
    // Upload-specific limit (the global API body limit is skipped for this route only).
    bodyLimit({
      maxSize: Math.max(deps.limits.IMAGE, deps.limits.VIDEO) + MULTIPART_OVERHEAD_BYTES,
      onError: (c) =>
        c.json(errorBody('PAYLOAD_TOO_LARGE', 'Datei zu groß.', c.get('requestId')), 413),
    }),
    async (c) => {
      const principal = c.get('principal');
      if (!principal) throw AppError.unauthenticated();
      if (!c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
        throw AppError.badRequest('multipart/form-data erwartet.');
      }
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw AppError.badRequest('Feld "file" fehlt.');
      const altText = typeof form.altText === 'string' ? form.altText.slice(0, 300) : null;
      const asset = await uploadLibraryMedia(deps, library, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        declaredType: file.type,
        fileName: file.name,
        altText,
        userId: principal.userId,
      });
      return c.json(asset, 201);
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

/** Copies into a standalone ArrayBuffer (a Node Buffer view may share a larger pool). */
const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function parseRange(
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
 * DEVELOPMENT delivery of PUBLIC objects from the local storage driver — mounted at /media.
 * Production serves public media from the CDN/public bucket instead (PUBLIC_MEDIA_BASE_URL).
 * Only keys under `public/` are served; private objects are never reachable here.
 */
export function localMediaDeliveryRoutes(storage: ObjectStorage) {
  const routes = new Hono<AppEnv>();

  routes.get('/*', async (c) => {
    const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ''));
    try {
      assertSafeStorageKey(key);
    } catch {
      throw AppError.notFound();
    }
    if (storage.driver !== 'local' || !key.startsWith('public/')) throw AppError.notFound();
    const object = await storage.get(key, 'PUBLIC');
    if (!object) throw AppError.notFound();

    const size = object.sizeBytes;
    c.header('Content-Type', object.contentType ?? 'application/octet-stream');
    c.header('Content-Disposition', 'inline');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    c.header('Accept-Ranges', 'bytes');
    // Media is embedded by the website (another origin in development); never executed.
    c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    c.header('Content-Security-Policy', "default-src 'none'; sandbox");

    const range = parseRange(c.req.header('Range'), size);
    if (c.req.header('Range') && !range) {
      c.header('Content-Range', `bytes */${size}`);
      return c.body(null, 416);
    }
    if (range) {
      c.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      c.header('Content-Length', String(range.end - range.start + 1));
      return c.body(toArrayBuffer(object.body.subarray(range.start, range.end + 1)), 206);
    }
    c.header('Content-Length', String(size));
    return c.body(toArrayBuffer(object.body), 200);
  });

  return routes;
}
