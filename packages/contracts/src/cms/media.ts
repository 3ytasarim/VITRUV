import { z } from 'zod';

/**
 * Media references inside CMS content.
 *
 * Section documents store only references to media_assets rows — never URLs or file paths — so
 * replacing an image or video never requires a code change. The API resolves references to
 * delivery URLs for frontends.
 */

/** Reference to a media_assets row as stored in section content. */
export const mediaRefSchema = z.object({
  assetId: z.uuid(),
  /**
   * Alt text for this placement; overrides the asset's default alt text.
   * Empty string = decorative in this placement (rendered with alt="" / aria-hidden).
   */
  altText: z.string().trim().max(300).optional(),
  /** Focal point (0..1) so art-directed crops keep the subject visible on every breakpoint. */
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

/**
 * A replaceable media position (hero background, Journey stage image …).
 *   desktop — required; used everywhere when no mobile variant exists (fallback)
 *   mobile  — optional art-directed variant below the md breakpoint; same kind as desktop
 *   poster  — optional still image shown before / instead of a video (images only)
 */
export const mediaSlotSchema = z.object({
  desktop: mediaRefSchema,
  mobile: mediaRefSchema.optional(),
  poster: mediaRefSchema.optional(),
});
export type MediaSlot = z.infer<typeof mediaSlotSchema>;

/** The variants of a slot, in a fixed order. */
export const MEDIA_SLOT_VARIANTS = ['desktop', 'mobile', 'poster'] as const;
export type MediaSlotVariant = (typeof MEDIA_SLOT_VARIANTS)[number];

/**
 * What the API delivers to frontends for a media reference: everything needed to render,
 * already resolved to a delivery URL. Frontends never build storage URLs themselves.
 */
export const resolvedMediaSchema = z.object({
  assetId: z.uuid(),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: z.url(),
  mimeType: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  altText: z.string(),
  focalPoint: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type ResolvedMedia = z.infer<typeof resolvedMediaSchema>;

export const resolvedMediaSlotSchema = z.object({
  desktop: resolvedMediaSchema,
  mobile: resolvedMediaSchema.optional(),
  poster: resolvedMediaSchema.optional(),
});
export type ResolvedMediaSlot = z.infer<typeof resolvedMediaSlotSchema>;

/** A media reference found in a content document, with its stable role (= path). */
export interface MediaRefOccurrence {
  /** e.g. `media.desktop`, `stages.kraft.media.mobile` */
  role: string;
  /** Path of the slot itself, e.g. `media`, `stages.kraft.media`. */
  slotPath: string;
  variant: MediaSlotVariant;
  ref: MediaRef;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSlot(value: unknown): value is MediaSlot {
  return isRecord(value) && isRecord(value.desktop) && typeof value.desktop.assetId === 'string';
}

/** Path segment for an array element: its stable `id` when present, otherwise the index. */
function segmentFor(item: unknown, index: number): string {
  return isRecord(item) && typeof item.id === 'string' ? item.id : String(index);
}

/**
 * Lists every media reference in a (validated) content document. Roles use item IDs, not array
 * indexes, so reordering a list does not change which role an asset has.
 */
export function collectMediaRefs(content: unknown): MediaRefOccurrence[] {
  const found: MediaRefOccurrence[] = [];
  const visit = (value: unknown, path: string[]) => {
    if (isSlot(value)) {
      const slotPath = path.join('.');
      for (const variant of MEDIA_SLOT_VARIANTS) {
        const ref = value[variant];
        if (ref) found.push({ role: `${slotPath}.${variant}`, slotPath, variant, ref });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, segmentFor(item, index)]));
      return;
    }
    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    }
  };
  visit(content, []);
  return found;
}

/**
 * Returns a copy of `content` with every media slot replaced by `resolve(slot, slotPath)`.
 * Used by the API to turn stored references into resolved, renderable media.
 */
export function mapMediaSlots(
  content: unknown,
  resolve: (slot: MediaSlot, slotPath: string) => unknown,
): unknown {
  const visit = (value: unknown, path: string[]): unknown => {
    if (isSlot(value)) return resolve(value, path.join('.'));
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, [...path, segmentFor(item, index)]));
    }
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, visit(child, [...path, key])]),
      );
    }
    return value;
  };
  return visit(content, []);
}
