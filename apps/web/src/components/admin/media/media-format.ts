import type { AdminMediaAsset } from '@vitruv/contracts';
import {
  WEBSITE_MEDIA_MAX_BYTES,
  WEBSITE_MEDIA_MIME_TYPES,
  websiteMediaKindForMimeType,
} from '@vitruv/shared';

/** Display helpers for media metadata (pure; unit-tested). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function describeMedia(
  asset: Pick<AdminMediaAsset, 'kind' | 'width' | 'height' | 'durationMs' | 'sizeBytes'>,
): string {
  const parts = [asset.kind === 'VIDEO' ? 'Video' : 'Bild'];
  if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`);
  const duration = formatDuration(asset.durationMs);
  if (duration) parts.push(duration);
  parts.push(formatBytes(asset.sizeBytes));
  return parts.join(' · ');
}

/** `accept` attribute for website uploads, optionally restricted to kinds. */
export function acceptAttribute(
  kinds: readonly ('IMAGE' | 'VIDEO')[] = ['IMAGE', 'VIDEO'],
): string {
  return kinds.flatMap((kind) => WEBSITE_MEDIA_MIME_TYPES[kind]).join(',');
}

/**
 * Quick client-side check before uploading (the API re-validates content and type).
 * Returns a German error message or null.
 */
export function precheckUpload(
  file: { type: string; size: number },
  kinds: readonly ('IMAGE' | 'VIDEO')[] = ['IMAGE', 'VIDEO'],
): string | null {
  const kind = websiteMediaKindForMimeType(file.type);
  if (!kind || !kinds.includes(kind)) {
    const allowed = kinds.includes('VIDEO')
      ? kinds.includes('IMAGE')
        ? 'JPEG, PNG, WebP, AVIF, MP4 oder WebM'
        : 'MP4 oder WebM'
      : 'JPEG, PNG, WebP oder AVIF';
    return `Dateityp nicht erlaubt. Erlaubt: ${allowed}.`;
  }
  if (file.size > WEBSITE_MEDIA_MAX_BYTES[kind]) {
    return `Datei zu groß (max. ${WEBSITE_MEDIA_MAX_BYTES[kind] / 1024 / 1024} MB).`;
  }
  return null;
}
