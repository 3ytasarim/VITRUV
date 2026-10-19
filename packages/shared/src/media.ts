/**
 * Media vocabulary shared by the DB schema, API and web.
 * Binary data never lives in PostgreSQL — only metadata + an object-storage key.
 */
export const MEDIA_KINDS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * PUBLIC  — editorial website media, served via CDN/public bucket.
 * PRIVATE — client-related files (nutrition PDFs, uploads, feedback videos); only via
 *           short-lived signed URLs after a server-side authorization check.
 */
export const MEDIA_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type MediaVisibility = (typeof MEDIA_VISIBILITIES)[number];

/** Allow-list of MIME types per kind across the platform. Feature uploads narrow this further. */
export const ALLOWED_MIME_TYPES: Readonly<Record<MediaKind, readonly string[]>> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  DOCUMENT: ['application/pdf'],
};

export function mediaKindForMimeType(mimeType: string): MediaKind | null {
  const normalized = mimeType.trim().toLowerCase();
  for (const kind of MEDIA_KINDS) {
    if (ALLOWED_MIME_TYPES[kind].includes(normalized)) return kind;
  }
  return null;
}

/** What a file is for. Stored on media_assets and used as the storage-key prefix. */
export const MEDIA_PURPOSES = [
  'WEBSITE',
  'TRAINING_VIDEO',
  'NUTRITION',
  'CLIENT_UPLOAD',
  'FEEDBACK_VIDEO',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

/**
 * Editorial website media (Admin → Website → Medien): browser-ready formats only.
 * QuickTime/HEVC sources are deliberately excluded — they need an H.264/WebM derivative first.
 */
export const WEBSITE_MEDIA_MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  VIDEO: ['video/mp4', 'video/webm'],
} as const satisfies Partial<Record<MediaKind, readonly string[]>>;

export type WebsiteMediaKind = keyof typeof WEBSITE_MEDIA_MIME_TYPES;

/** Default upload limits for website media (bytes); the API can lower/raise them via env. */
export const WEBSITE_MEDIA_MAX_BYTES: Readonly<Record<WebsiteMediaKind, number>> = {
  IMAGE: 20 * 1024 * 1024,
  VIDEO: 100 * 1024 * 1024,
};

/** File extension used in storage keys for each allowed website MIME type. */
export const WEBSITE_MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function websiteMediaKindForMimeType(mimeType: string): WebsiteMediaKind | null {
  const normalized = mimeType.trim().toLowerCase();
  if ((WEBSITE_MEDIA_MIME_TYPES.IMAGE as readonly string[]).includes(normalized)) return 'IMAGE';
  if ((WEBSITE_MEDIA_MIME_TYPES.VIDEO as readonly string[]).includes(normalized)) return 'VIDEO';
  return null;
}
