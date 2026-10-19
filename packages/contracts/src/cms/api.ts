import { WEBSITE_SECTION_TYPES, WEBSITE_VERSION_STATUSES } from '@vitruv/shared';
import { z } from 'zod';
import { publicSectionContentSchemas } from './sections';

/**
 * Wire shapes of the website CMS API.
 *
 *   Admin:  /v1/admin/website/…   (permission-guarded; drafts visible)
 *   Public: /v1/public/website/…  (published content only, media resolved)
 */

const isoDate = z.iso.datetime({ offset: true });

export const websiteSectionTypeSchema = z.enum(WEBSITE_SECTION_TYPES);
export const websiteVersionStatusSchema = z.enum(WEBSITE_VERSION_STATUSES);

export const pageSlugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const sectionKeySchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** One section of a page with its publication state (admin overview). */
export const websiteSectionSummarySchema = z.object({
  id: z.uuid(),
  key: sectionKeySchema,
  type: websiteSectionTypeSchema,
  sortOrder: z.number().int(),
  enabled: z.boolean(),
  hasDraft: z.boolean(),
  hasPublished: z.boolean(),
  draftUpdatedAt: isoDate.nullable(),
  publishedAt: isoDate.nullable(),
});
export type WebsiteSectionSummary = z.infer<typeof websiteSectionSummarySchema>;

export const adminWebsitePageSchema = z.object({
  slug: pageSlugSchema,
  title: z.string(),
  contentRevision: z.number().int().nonnegative(),
  lastPublishedAt: isoDate.nullable(),
  sections: z.array(websiteSectionSummarySchema),
});
export type AdminWebsitePage = z.infer<typeof adminWebsitePageSchema>;

export const adminWebsitePagesSchema = z.object({ pages: z.array(adminWebsitePageSchema) });
export type AdminWebsitePages = z.infer<typeof adminWebsitePagesSchema>;

export const websiteSectionVersionSchema = z.object({
  id: z.uuid(),
  status: websiteVersionStatusSchema,
  /** Stored content (media as references). Validated against the section type's schema. */
  content: z.record(z.string(), z.unknown()),
  schemaVersion: z.number().int().positive(),
  createdAt: isoDate,
  updatedAt: isoDate,
  publishedAt: isoDate.nullable(),
});
export type WebsiteSectionVersion = z.infer<typeof websiteSectionVersionSchema>;

/** GET /v1/admin/website/pages/:slug/sections/:key */
export const adminSectionDetailSchema = z.object({
  page: z.object({ slug: pageSlugSchema, title: z.string() }),
  section: websiteSectionSummarySchema,
  draft: websiteSectionVersionSchema.nullable(),
  published: websiteSectionVersionSchema.nullable(),
});
export type AdminSectionDetail = z.infer<typeof adminSectionDetailSchema>;

/** PUT …/sections/:key/draft — content is validated server-side by the section's type schema. */
export const saveDraftRequestSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

export const saveDraftResponseSchema = z.object({
  draft: websiteSectionVersionSchema,
  /** Non-blocking hints, e.g. images without alt text (publishing requires them). */
  warnings: z.array(z.object({ path: z.string(), message: z.string() })),
});
export type SaveDraftResponse = z.infer<typeof saveDraftResponseSchema>;

/** POST …/sections/:key/publish */
export const publishResponseSchema = z.object({
  published: websiteSectionVersionSchema,
  /** Page-level revision after this publish (cache key for the public website). */
  contentRevision: z.number().int().positive(),
});
export type PublishResponse = z.infer<typeof publishResponseSchema>;

/** GET …/sections/:key/preview — draft (or published, if no draft) with media resolved. */
export const sectionPreviewSchema = z.object({
  section: websiteSectionSummarySchema,
  source: z.enum(['DRAFT', 'PUBLISHED']),
  updatedAt: isoDate,
  content: z.record(z.string(), z.unknown()),
});
export type SectionPreview = z.infer<typeof sectionPreviewSchema>;

const publicSection = <T extends (typeof WEBSITE_SECTION_TYPES)[number]>(type: T) =>
  z.object({
    key: sectionKeySchema,
    type: z.literal(type),
    content: publicSectionContentSchemas[type],
  });

export const publicWebsiteSectionSchema = z.discriminatedUnion('type', [
  publicSection('hero'),
  publicSection('results'),
  publicSection('journey'),
  publicSection('coaching'),
  publicSection('packages'),
  publicSection('about'),
  publicSection('faq'),
  publicSection('cta'),
  publicSection('footer'),
  publicSection('pillars'),
  publicSection('situations'),
  publicSection('gallery'),
  publicSection('steps'),
  publicSection('theme'),
  publicSection('seo'),
]);
export type PublicWebsiteSection = z.infer<typeof publicWebsiteSectionSchema>;

/**
 * GET /v1/public/website/pages/:slug — published, enabled sections only, in page order.
 * No draft content, no user IDs, no storage keys.
 */
export const publicWebsitePageSchema = z.object({
  slug: pageSlugSchema,
  title: z.string(),
  contentRevision: z.number().int().nonnegative(),
  publishedAt: isoDate.nullable(),
  sections: z.array(publicWebsiteSectionSchema),
});
export type PublicWebsitePage = z.infer<typeof publicWebsitePageSchema>;

/**
 * PATCH /v1/admin/website/pages/:slug/sections/:key — section settings that change the public
 * page immediately (no draft): visibility and position. Permission `website.content.publish`.
 */
export const updateSectionSettingsRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
  })
  .refine((value) => value.enabled !== undefined || value.sortOrder !== undefined, {
    message: 'enabled oder sortOrder angeben.',
  });
export type UpdateSectionSettingsRequest = z.infer<typeof updateSectionSettingsRequestSchema>;

/** Body the API sends to the web app's revalidation endpoint after a public change. */
export const revalidationRequestSchema = z.object({
  tags: z
    .array(z.string().regex(/^website:[a-z0-9-]+$/))
    .min(1)
    .max(10),
  contentRevision: z.number().int().nonnegative(),
});
export type RevalidationRequest = z.infer<typeof revalidationRequestSchema>;
