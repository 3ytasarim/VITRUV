/**
 * Nutrition V1 (Sprint 8, docs/NUTRITION-ARCHITECTURE.md): client-specific PDF documents.
 * No calories, macros, meals or food tracking — the coach uploads an approved PDF.
 */

/**
 * DRAFT    — uploaded, not yet visible to the client (upload never auto-activates)
 * ACTIVE   — the client's current plan (at most ONE per client, DB-enforced)
 * ARCHIVED — replaced or withdrawn; kept as history, never deleted
 */
export const NUTRITION_DOCUMENT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type NutritionDocumentStatus = (typeof NUTRITION_DOCUMENT_STATUSES)[number];

/** PDF only. 25 MiB covers image-heavy plans exported from design tools with headroom. */
export const NUTRITION_PDF_MIME_TYPE = 'application/pdf';
export const NUTRITION_PDF_MAX_BYTES = 25 * 1024 * 1024;

export const NUTRITION_TITLE_MAX = 160;
export const NUTRITION_VERSION_LABEL_MAX = 60;
