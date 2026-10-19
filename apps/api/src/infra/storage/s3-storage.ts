import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaVisibility } from '@vitruv/shared';
import {
  StorageUnavailableError,
  type ByteRange,
  type ObjectHead,
  type ObjectStorage,
  type ObjectStream,
  type SignedUrlOptions,
} from './object-storage';
import { assertSafeStorageKey } from './storage-keys';

/**
 * S3-compatible driver (production: Hetzner Object Storage, e.g. endpoint
 * https://fsn1.your-objectstorage.com, region fsn1). PUBLIC objects go to the public bucket,
 * PRIVATE objects to the private bucket; the object key is the unchanged storage key.
 *
 * - Large objects are streamed (`getStream`, optional byte range for HTTP 206) — never buffered.
 * - Private objects are only handed out as short-lived presigned GET URLs after the caller's
 *   own authorisation check (`signedUrl`).
 * - Provider errors are wrapped in StorageUnavailableError (no credentials or URLs in messages);
 *   "not found" is a normal `null` / `false` result.
 */
export interface S3StorageConfig {
  endpoint: string;
  region: string;
  publicBucket: string;
  privateBucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style addressing (`endpoint/bucket/key`); Hetzner works with both, default false. */
  forcePathStyle?: boolean;
  /** Optional ACL for PUBLIC uploads (e.g. 'public-read') when the bucket has no read policy. */
  publicObjectAcl?: 'public-read';
}

type Send = (command: unknown) => Promise<unknown>;
type Presign = (command: GetObjectCommand, expiresIn: number) => Promise<string>;

export interface S3StorageDeps {
  /** Injected in tests; production builds a real S3Client from the config. */
  send?: Send;
  presign?: Presign;
}

export function createS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // S3-compatible providers do not all accept the newer default CRC checksums.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3,
  });
}

const isNotFound = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchBucket' ||
    e?.$metadata?.httpStatusCode === 404
  );
};
const isRangeError = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'InvalidRange' || e?.$metadata?.httpStatusCode === 416;
};

/** "bytes 0-99/12345" → 12345 */
const totalFromContentRange = (value: string | undefined) => {
  const total = value?.split('/')[1];
  return total && total !== '*' ? Number(total) : null;
};

export function createS3Storage(config: S3StorageConfig, deps: S3StorageDeps = {}): ObjectStorage {
  let client: S3Client | null = null;
  const real = () => (client ??= createS3Client(config));
  const send: Send = deps.send ?? ((command) => real().send(command as never));
  const presign: Presign =
    deps.presign ?? ((command, expiresIn) => getSignedUrl(real(), command, { expiresIn }));

  const bucketFor = (visibility: MediaVisibility) =>
    visibility === 'PUBLIC' ? config.publicBucket : config.privateBucket;
  const target = (key: string, visibility: MediaVisibility) => {
    assertSafeStorageKey(key);
    return { Bucket: bucketFor(visibility), Key: key };
  };
  const guard = async <T>(operation: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError(operation, error);
    }
  };

  const head = (key: string, visibility: MediaVisibility) =>
    guard('head', async (): Promise<ObjectHead | null> => {
      try {
        const out = (await send(new HeadObjectCommand(target(key, visibility)))) as {
          ContentLength?: number;
          ContentType?: string;
        };
        return { sizeBytes: out.ContentLength ?? 0, contentType: out.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    });

  return {
    driver: 's3',

    put: ({ key, body, contentType, visibility }) =>
      guard('put', async () => {
        await send(
          new PutObjectCommand({
            ...target(key, visibility),
            Body: body,
            ContentType: contentType,
            ContentLength: body.byteLength,
            // Keys are unique per upload (uuid) → immutable caching is safe for public media.
            CacheControl:
              visibility === 'PUBLIC' ? 'public, max-age=31536000, immutable' : 'private, no-store',
            ...(visibility === 'PUBLIC' && config.publicObjectAcl
              ? { ACL: config.publicObjectAcl }
              : {}),
          }),
        );
        return { key, sizeBytes: body.byteLength };
      }),

    get: (key, visibility) =>
      guard('get', async () => {
        try {
          const out = (await send(
            new GetObjectCommand(target(key, visibility)),
          )) as GetObjectCommandOutput;
          if (!out.Body) return null;
          const body = await out.Body.transformToByteArray();
          return { body, contentType: out.ContentType ?? null, sizeBytes: body.byteLength };
        } catch (error) {
          if (isNotFound(error)) return null;
          throw error;
        }
      }),

    head,

    getStream: (key, visibility, range?: ByteRange) =>
      guard('getStream', async (): Promise<ObjectStream | null> => {
        try {
          const out = (await send(
            new GetObjectCommand({
              ...target(key, visibility),
              ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
            }),
          )) as GetObjectCommandOutput;
          if (!out.Body) return null;
          const total = range
            ? (totalFromContentRange(out.ContentRange) ?? 0)
            : (out.ContentLength ?? 0);
          return {
            body: out.Body.transformToWebStream() as ReadableStream<Uint8Array>,
            contentType: out.ContentType ?? null,
            sizeBytes: total,
            range: range ?? null,
          };
        } catch (error) {
          if (isNotFound(error) || isRangeError(error)) return null;
          throw error;
        }
      }),

    exists: async (key, visibility) => (await head(key, visibility)) !== null,

    delete: (key, visibility) =>
      guard('delete', async () => {
        await send(new DeleteObjectCommand(target(key, visibility)));
      }),

    signedUrl: (key, visibility, options: SignedUrlOptions) =>
      guard('signedUrl', async () => {
        const expiresIn = Math.max(1, Math.min(3600, Math.round(options.expiresInSeconds)));
        return presign(
          new GetObjectCommand({
            ...target(key, visibility),
            ...(options.contentDisposition
              ? { ResponseContentDisposition: options.contentDisposition }
              : {}),
            ...(options.contentType ? { ResponseContentType: options.contentType } : {}),
            ResponseCacheControl: 'private, no-store',
          }),
          expiresIn,
        );
      }),
  };
}
