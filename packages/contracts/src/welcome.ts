import { z } from 'zod';

/**
 * "Willkommen" (owner request 2026-11-18): categories (tabs) with videos from the training media
 * library, managed by ADMIN (`/v1/admin/welcome`) and shown to every client
 * (`/v1/client/welcome`). The client view contains only categories that have videos and no file
 * names / storage keys.
 */

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'Bitte ausfüllen.')
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine(
      (value) => !/[\r\n]/.test(value) && !CONTROL.test(value),
      'Enthält unzulässige Zeichen.',
    );
/** Multi-line plain text; empty → null. */
const longText = (max: number) =>
  z
    .string()
    .max(max, `Höchstens ${max} Zeichen.`)
    .refine((value) => !CONTROL.test(value), 'Enthält unzulässige Zeichen.')
    .transform((value) => (value.trim() === '' ? null : value.trim()));

export const WELCOME_LIMITS = { categoryName: 60, title: 120, description: 500 } as const;

export const welcomeVideoSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  video: z.object({
    assetId: z.uuid(),
    url: z.string(),
    mimeType: z.string(),
    durationMs: z.number().int().nullable(),
  }),
});
export type WelcomeVideo = z.infer<typeof welcomeVideoSchema>;

export const welcomeCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  videos: z.array(welcomeVideoSchema),
});
export type WelcomeCategory = z.infer<typeof welcomeCategorySchema>;

/** GET /v1/client/welcome — only categories with at least one video, in admin order. */
export const clientWelcomeSchema = z.object({ categories: z.array(welcomeCategorySchema) });
export type ClientWelcome = z.infer<typeof clientWelcomeSchema>;

export const adminWelcomeVideoSchema = welcomeVideoSchema.extend({
  video: welcomeVideoSchema.shape.video.extend({ fileName: z.string() }),
});
export type AdminWelcomeVideo = z.infer<typeof adminWelcomeVideoSchema>;
export const adminWelcomeCategorySchema = welcomeCategorySchema.extend({
  videos: z.array(adminWelcomeVideoSchema),
});
export type AdminWelcomeCategory = z.infer<typeof adminWelcomeCategorySchema>;
/** GET /v1/admin/welcome — all categories (also empty ones). */
export const adminWelcomeSchema = z.object({ categories: z.array(adminWelcomeCategorySchema) });
export type AdminWelcome = z.infer<typeof adminWelcomeSchema>;

/** POST/PATCH /v1/admin/welcome/categories[/:id] */
export const welcomeCategoryRequestSchema = z.object({ name: line(WELCOME_LIMITS.categoryName) });
export type WelcomeCategoryRequest = z.infer<typeof welcomeCategoryRequestSchema>;

/** POST /v1/admin/welcome/videos */
export const createWelcomeVideoRequestSchema = z.object({
  categoryId: z.uuid(),
  mediaAssetId: z.uuid(),
  title: line(WELCOME_LIMITS.title),
  description: longText(WELCOME_LIMITS.description).optional(),
});
export type CreateWelcomeVideoRequest = z.input<typeof createWelcomeVideoRequestSchema>;

/** PATCH /v1/admin/welcome/videos/:id */
export const updateWelcomeVideoRequestSchema = z
  .object({
    categoryId: z.uuid(),
    mediaAssetId: z.uuid(),
    title: line(WELCOME_LIMITS.title),
    description: longText(WELCOME_LIMITS.description),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Keine Änderung.');
export type UpdateWelcomeVideoRequest = z.input<typeof updateWelcomeVideoRequestSchema>;

/** PUT /v1/admin/welcome/categories/order and …/categories/:id/videos/order */
export const welcomeOrderRequestSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'Doppelte Einträge.'),
});
export type WelcomeOrderRequest = z.infer<typeof welcomeOrderRequestSchema>;
