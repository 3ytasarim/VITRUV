import type { MediaVisibility } from '@vitruv/shared';

/**
 * S3-shaped object storage abstraction. Every driver (local dev disk, Cloudflare R2, AWS S3,
 * Hetzner Object Storage, MinIO ...) implements this; domain code depends only on this interface.
 *
 * Visibility maps to separate buckets in S3-compatible providers:
 *   PUBLIC  → public bucket behind CDN (editorial website media)
 *   PRIVATE → private bucket, read only via short-lived signed URLs (client files)
 */
export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  visibility: MediaVisibility;
}

export interface StoredObject {
  body: Uint8Array;
  contentType: string | null;
  sizeBytes: number;
}

export interface ObjectStorage {
  readonly driver: 'local' | 's3';
  put(input: PutObjectInput): Promise<{ key: string; sizeBytes: number }>;
  get(key: string, visibility: MediaVisibility): Promise<StoredObject | null>;
  exists(key: string, visibility: MediaVisibility): Promise<boolean>;
  delete(key: string, visibility: MediaVisibility): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageNotConfiguredError';
  }
}
