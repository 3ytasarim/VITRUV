import { assertSafeStorageKey } from '../../infra/storage/index';

/**
 * Builds delivery URLs for PUBLIC objects. Frontends never construct storage URLs themselves.
 *   local driver → `${API_PUBLIC_URL}/media/<key>` (served by the API, development only)
 *   s3 driver    → `${PUBLIC_MEDIA_BASE_URL}/<key>` (CDN / public bucket)
 */
export interface MediaUrlResolver {
  publicUrl(storageKey: string): string;
}

export function createMediaUrlResolver(baseUrl: string): MediaUrlResolver {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    publicUrl(storageKey) {
      assertSafeStorageKey(storageKey);
      return `${base}/${storageKey}`;
    },
  };
}
