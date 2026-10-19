import { randomUUID } from 'node:crypto';
import type { MediaVisibility } from '@vitruv/shared';

/** What a file is for. Drives the key prefix so lifecycle/backup rules can target folders. */
export const STORAGE_PURPOSES = [
  'website',
  'training-video',
  'nutrition',
  'client-upload',
  'feedback-video',
] as const;
export type StoragePurpose = (typeof STORAGE_PURPOSES)[number];

const SAFE_KEY = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;
const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/;

/**
 * Generates an unguessable, collision-free key, e.g. `public/website/2026/10/<uuid>.webp`.
 * The original file name is stored in media_assets.file_name — never in the key — so user
 * input can not influence object paths.
 */
export function buildStorageKey(input: {
  visibility: MediaVisibility;
  purpose: StoragePurpose;
  extension: string;
  now?: Date;
  id?: string;
}): string {
  const extension = input.extension.toLowerCase().replace(/^\./, '');
  if (!SAFE_EXTENSION.test(extension)) throw new Error('Unsupported file extension.');
  const now = input.now ?? new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const key = `${input.visibility.toLowerCase()}/${input.purpose}/${now.getUTCFullYear()}/${month}/${input.id ?? randomUUID()}.${extension}`;
  assertSafeStorageKey(key);
  return key;
}

/** Rejects traversal (`..`), absolute paths, backslashes, empty segments and uppercase. */
export function assertSafeStorageKey(key: string): void {
  if (
    !SAFE_KEY.test(key) ||
    key.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error('Invalid storage key.');
  }
}
