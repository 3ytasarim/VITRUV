import type { MediaVisibility } from '@vitruv/shared';

/**
 * S3-shaped object storage abstraction. Every driver (local dev disk, Hetzner Object Storage,
 * Cloudflare R2, AWS S3, MinIO ...) implements this; domain code depends only on this interface.
 *
 * Visibility maps to separate buckets in S3-compatible providers:
 *   PUBLIC  → public bucket (editorial website media, training videos)
 *   PRIVATE → private bucket, read only after an authorisation check via short-lived signed URLs
 *
 * The object key is ALWAYS the stored `media_assets.storage_key` (it already starts with
 * `public/` or `private/`). Drivers never rewrite keys; the local driver only adds its own
 * visibility folder on disk.
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

export interface ObjectHead {
  contentType: string | null;
  sizeBytes: number;
}

/** Inclusive byte range (HTTP `Range: bytes=start-end`). */
export interface ByteRange {
  start: number;
  end: number;
}

/** A streamed object (or a byte range of it) — never buffered completely in memory. */
export interface ObjectStream extends ObjectHead {
  body: ReadableStream<Uint8Array>;
  /** Set when a range was requested and served. */
  range: ByteRange | null;
}

export interface SignedUrlOptions {
  /** Lifetime of the URL in seconds (keep short: 60–300). */
  expiresInSeconds: number;
  /** Overrides the response Content-Disposition (e.g. `attachment; filename="…"`). */
  contentDisposition?: string;
  /** Overrides the response Content-Type. */
  contentType?: string;
}

export interface ObjectStorage {
  readonly driver: 'local' | 's3';
  put(input: PutObjectInput): Promise<{ key: string; sizeBytes: number }>;
  /** Whole object in memory — only for small files (PDF documents, validation). */
  get(key: string, visibility: MediaVisibility): Promise<StoredObject | null>;
  head(key: string, visibility: MediaVisibility): Promise<ObjectHead | null>;
  /** Streams the object or one byte range of it (video seeking → HTTP 206). */
  getStream(
    key: string,
    visibility: MediaVisibility,
    range?: ByteRange,
  ): Promise<ObjectStream | null>;
  exists(key: string, visibility: MediaVisibility): Promise<boolean>;
  delete(key: string, visibility: MediaVisibility): Promise<void>;
  /**
   * Short-lived signed GET URL (S3 only). `null` = this driver has no signed URLs (local
   * development) — callers then stream the object themselves after their own authorisation.
   */
  signedUrl(
    key: string,
    visibility: MediaVisibility,
    options: SignedUrlOptions,
  ): Promise<string | null>;
}

export class StorageNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageNotConfiguredError';
  }
}

/** A storage backend failed (network, permissions, provider error). Message is safe to log. */
export class StorageUnavailableError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Object storage ${operation} failed.`, { cause });
    this.name = 'StorageUnavailableError';
  }
}
