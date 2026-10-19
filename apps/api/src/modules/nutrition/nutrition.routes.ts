import { uploadNutritionDocumentFieldsSchema } from '@vitruv/contracts';
import { NUTRITION_PDF_MAX_BYTES } from '@vitruv/shared';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { AppError, errorBody } from '../../lib/errors';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import { pdfContentDisposition } from './pdf-validation';
import * as nutrition from './nutrition.service';

const idParam = z.object({ id: z.uuid() });
const clientParam = z.object({ clientId: z.uuid() });
const documentParam = z.object({ documentId: z.uuid() });
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** Upload paths whose body exceeds the global API limit (checked in app.ts). */
export const NUTRITION_UPLOAD_PATH = /^\/v1\/admin\/nutrition\/clients\/[0-9a-f-]{36}\/documents$/i;

function actorOf(c: Context<AppEnv>) {
  const principal = c.get('principal');
  if (!principal) throw AppError.unauthenticated();
  return principal;
}

/**
 * The private PDF response. `private, no-store`: never cached by shared caches or proxies;
 * `nosniff` + sandbox CSP: the bytes can never be interpreted as anything but a PDF download.
 */
function pdfResponse(c: Context<AppEnv>, file: nutrition.PrivateFile) {
  c.header('Content-Type', 'application/pdf');
  c.header('Content-Disposition', pdfContentDisposition(file.fileName));
  c.header('Content-Length', String(file.body.byteLength));
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  const body = file.body.buffer.slice(
    file.body.byteOffset,
    file.body.byteOffset + file.body.byteLength,
  ) as ArrayBuffer;
  return c.body(body, 200);
}

/** /v1/admin/nutrition — Coach/Admin; every id is scoped to the actor's clients. */
export function adminNutritionRoutes(deps: nutrition.NutritionDeps) {
  const r = new Hono<AppEnv>();
  const read = requirePermission('nutrition.documents.read');
  const assign = requirePermission('nutrition.documents.assign');

  r.get('/clients/:clientId/documents', read, validate('param', clientParam), async (c) =>
    c.json(await nutrition.listClientDocuments(deps, actorOf(c), c.req.valid('param').clientId)),
  );

  r.post(
    '/clients/:clientId/documents',
    requirePermission('nutrition.documents.write'),
    validate('param', clientParam),
    bodyLimit({
      maxSize: (deps.maxBytes ?? NUTRITION_PDF_MAX_BYTES) + MULTIPART_OVERHEAD_BYTES,
      onError: (c) =>
        c.json(
          errorBody(
            'PAYLOAD_TOO_LARGE',
            `Datei zu groß (max. ${Math.floor((deps.maxBytes ?? NUTRITION_PDF_MAX_BYTES) / 1024 / 1024)} MB).`,
            c.get('requestId'),
          ),
          413,
        ),
    }),
    async (c) => {
      if (!c.req.header('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
        throw AppError.badRequest('multipart/form-data erwartet.');
      }
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw AppError.badRequest('Feld "file" fehlt.');
      const fields = uploadNutritionDocumentFieldsSchema.safeParse({
        title: typeof form.title === 'string' ? form.title : undefined,
        versionLabel: typeof form.versionLabel === 'string' ? form.versionLabel : undefined,
        effectiveFrom: typeof form.effectiveFrom === 'string' ? form.effectiveFrom : undefined,
      });
      if (!fields.success) {
        throw AppError.validation(
          fields.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        );
      }
      const document = await nutrition.uploadDocument(
        deps,
        actorOf(c),
        c.req.valid('param').clientId,
        {
          bytes: new Uint8Array(await file.arrayBuffer()),
          declaredType: file.type,
          fileName: file.name,
          ...fields.data,
        },
      );
      return c.json(document, 201);
    },
  );

  r.get('/documents/:id', read, validate('param', idParam), async (c) =>
    c.json(await nutrition.getDocument(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.post('/documents/:id/activate', assign, validate('param', idParam), async (c) =>
    c.json(await nutrition.activateDocument(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.post('/documents/:id/archive', assign, validate('param', idParam), async (c) =>
    c.json(await nutrition.archiveDocument(deps, actorOf(c), c.req.valid('param').id)),
  );
  r.get('/documents/:id/file', read, validate('param', idParam), async (c) =>
    pdfResponse(c, await nutrition.documentFile(deps, actorOf(c), c.req.valid('param').id)),
  );
  return r;
}

/** /v1/client/nutrition — the signed-in CLIENT's own ACTIVE document (self context). */
export function clientNutritionRoutes(deps: nutrition.NutritionDeps) {
  const r = new Hono<AppEnv>();
  const self = requirePermission('nutrition.self.read');
  r.get('/active', self, async (c) =>
    c.json(await nutrition.clientActiveDocument(deps, actorOf(c))),
  );
  r.get('/:documentId/file', self, validate('param', documentParam), async (c) =>
    pdfResponse(
      c,
      await nutrition.clientDocumentFile(deps, actorOf(c), c.req.valid('param').documentId),
    ),
  );
  return r;
}
