import type { MediaPurpose, MediaVisibility } from '@vitruv/shared';
import { assertSafeStorageKey } from '../../infra/storage/index';
import { currentMediaViewer, type TrainingMediaSigner } from './training-media-access';

/**
 * Builds delivery URLs. Frontends never construct storage URLs themselves.
 *   PUBLIC  objects: local driver → `${API_PUBLIC_URL}/media/<key>` (served by the API),
 *                    s3 driver    → `${PUBLIC_MEDIA_BASE_URL}/<key>` (CDN / public bucket)
 *   PRIVATE training media (Sprint 8A): a short-lived URL signed for the CURRENT viewer
 *                    (training-media-access.ts); null when signing is not configured or there is
 *                    no authenticated viewer — callers then show no medium (fail closed).
 *   Other PRIVATE media (nutrition PDFs …) never get a URL here (their own signed-URL endpoints).
 */
export interface MediaUrlResolver {
  publicUrl(storageKey: string): string;
  assetUrl(asset: MediaUrlAsset): string | null;
}

export interface MediaUrlAsset {
  id: string;
  storageKey: string;
  visibility: MediaVisibility;
  purpose: MediaPurpose;
}

export function createMediaUrlResolver(
  baseUrl: string,
  trainingSigner?: TrainingMediaSigner,
): MediaUrlResolver {
  const base = baseUrl.replace(/\/+$/, '');
  const publicUrl = (storageKey: string) => {
    assertSafeStorageKey(storageKey);
    return `${base}/${storageKey}`;
  };
  return {
    publicUrl,
    assetUrl(asset) {
      if (asset.visibility === 'PUBLIC') return publicUrl(asset.storageKey);
      if (asset.purpose !== 'TRAINING_VIDEO' || !trainingSigner) return null;
      const viewer = currentMediaViewer();
      return viewer ? trainingSigner.sign(asset.id, viewer).url : null;
    },
  };
}
