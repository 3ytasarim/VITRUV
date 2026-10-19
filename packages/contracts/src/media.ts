import { MEDIA_KINDS, MEDIA_VISIBILITIES, WEBSITE_VERSION_STATUSES } from '@vitruv/shared';
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });

/** Public representation of a media_assets row. `storageKey` stays server-side. */
export const mediaAssetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(MEDIA_KINDS),
  visibility: z.enum(MEDIA_VISIBILITIES),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  altText: z.string().nullable(),
  /** Resolved delivery URL (CDN for PUBLIC, short-lived signed URL for PRIVATE). */
  url: z.url(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type MediaAssetDto = z.infer<typeof mediaAssetSchema>;

/** Where a website asset is used by live content (draft or published section versions). */
export const mediaUsageSchema = z.object({
  pageSlug: z.string(),
  sectionKey: z.string(),
  sectionType: z.string(),
  status: z.enum(WEBSITE_VERSION_STATUSES),
  /** Position inside the section, e.g. `media.desktop`, `stages.kraft.media.mobile`. */
  role: z.string(),
});
export type MediaUsage = z.infer<typeof mediaUsageSchema>;

/** Admin media library entry. */
export const adminMediaAssetSchema = mediaAssetSchema.extend({
  usageCount: z.number().int().nonnegative(),
});
export type AdminMediaAsset = z.infer<typeof adminMediaAssetSchema>;

export const adminMediaListSchema = z.object({ items: z.array(adminMediaAssetSchema) });
export type AdminMediaList = z.infer<typeof adminMediaListSchema>;

export const adminMediaDetailSchema = adminMediaAssetSchema.extend({
  usages: z.array(mediaUsageSchema),
  /** Exercises using the asset (training media). Deletion is refused while any exist. */
  exerciseUsages: z
    .array(z.object({ exerciseId: z.uuid(), name: z.string(), active: z.boolean() }))
    .default([]),
});
export type AdminMediaDetail = z.infer<typeof adminMediaDetailSchema>;

export const mediaListQuerySchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO']).optional(),
});

/** PATCH /v1/admin/media/:id — only editorial metadata is editable; the file is immutable. */
export const updateMediaRequestSchema = z.object({
  /** null = no default alt text (placements must then provide one or mark the image decorative). */
  altText: z.string().trim().max(300).nullable(),
});
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;
