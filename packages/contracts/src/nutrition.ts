import {
  NUTRITION_DOCUMENT_STATUSES,
  NUTRITION_TITLE_MAX,
  NUTRITION_VERSION_LABEL_MAX,
} from '@vitruv/shared';
import { z } from 'zod';

/**
 * Nutrition V1 contracts (Sprint 8, docs/NUTRITION-ARCHITECTURE.md) — client-specific PDFs.
 *
 * PRIVATE FILES: no DTO carries a URL, storage key or path. The file is described by
 * `PrivateDocumentFile` and fetched through an AUTHENTICATED API path (`fileApiPath`) that the
 * caller must request with its Bearer token / session — deliberately not named `url` so it can not
 * be mistaken for a public media link. A future S3 driver can answer that path with a short-lived
 * presigned redirect without changing these contracts.
 */

export const nutritionDocumentStatusSchema = z.enum(NUTRITION_DOCUMENT_STATUSES);

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u001F\u007F]/;
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bitte ausfüllen.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((v) => !CONTROL.test(v), 'Enthält unzulässige Zeichen.');
const isoDate = z.iso.date('Bitte ein gültiges Datum (JJJJ-MM-TT) angeben.');

/** Metadata fields of the multipart upload (the PDF itself is the `file` part). */
export const uploadNutritionDocumentFieldsSchema = z.strictObject({
  title: line(NUTRITION_TITLE_MAX),
  versionLabel: z
    .string()
    .trim()
    .max(NUTRITION_VERSION_LABEL_MAX, `Höchstens ${NUTRITION_VERSION_LABEL_MAX} Zeichen.`)
    .refine((v) => !CONTROL.test(v), 'Enthält unzulässige Zeichen.')
    .transform((v) => (v === '' ? null : v))
    .optional(),
  effectiveFrom: z
    .union([isoDate, z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .optional(),
});
export type UploadNutritionDocumentFields = z.infer<typeof uploadNutritionDocumentFieldsSchema>;

/** A private document file: never a URL. */
export const privateDocumentFileSchema = z.object({
  mimeType: z.literal('application/pdf'),
  sizeBytes: z.number().int().min(0),
  /** Sanitised original name — display only, never a path. */
  fileName: z.string(),
  /** Authenticated API path (requires the caller's credentials). */
  fileApiPath: z.string().regex(/^\/v1\/(admin|client)\/nutrition\/[^?#]+\/file$/),
});
export type PrivateDocumentFile = z.infer<typeof privateDocumentFileSchema>;

/** Coach/Admin view (history incl. drafts and archived versions). */
export const adminNutritionDocumentSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  title: z.string(),
  versionNumber: z.number().int().min(1),
  versionLabel: z.string().nullable(),
  status: nutritionDocumentStatusSchema,
  effectiveFrom: z.iso.date().nullable(),
  activatedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  uploadedBy: z.object({ displayName: z.string() }).nullable(),
  file: privateDocumentFileSchema,
});
export type AdminNutritionDocument = z.infer<typeof adminNutritionDocumentSchema>;

export const adminNutritionDocumentListSchema = z.object({
  items: z.array(adminNutritionDocumentSchema),
});
export type AdminNutritionDocumentList = z.infer<typeof adminNutritionDocumentListSchema>;

/** Activation answer: the new ACTIVE document and the one it replaced (now ARCHIVED). */
export const activateNutritionDocumentResponseSchema = z.object({
  document: adminNutritionDocumentSchema,
  archivedDocumentId: z.uuid().nullable(),
});
export type ActivateNutritionDocumentResponse = z.infer<
  typeof activateNutritionDocumentResponseSchema
>;

/** Client view — only what the app needs (no uploader, no status history, no internals). */
export const clientNutritionDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  versionNumber: z.number().int().min(1),
  versionLabel: z.string().nullable(),
  effectiveFrom: z.iso.date().nullable(),
  activatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  file: privateDocumentFileSchema,
});
export type ClientNutritionDocument = z.infer<typeof clientNutritionDocumentSchema>;

export const clientActiveNutritionResponseSchema = z.object({
  document: clientNutritionDocumentSchema.nullable(),
});
export type ClientActiveNutritionResponse = z.infer<typeof clientActiveNutritionResponseSchema>;
