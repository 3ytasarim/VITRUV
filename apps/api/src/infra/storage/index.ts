import type { ApiEnv } from '../../config/env';
import { createLocalStorage } from './local-storage';
import { type ObjectStorage, StorageNotConfiguredError } from './object-storage';
import { createS3Storage } from './s3-storage';

export * from './object-storage';
export * from './storage-keys';
export { localPathFor } from './local-storage';
export { createS3Storage, type S3StorageConfig } from './s3-storage';

/** Selects the storage driver from validated env (local = development, s3 = production). */
export function createObjectStorage(env: ApiEnv): ObjectStorage {
  switch (env.STORAGE_DRIVER) {
    case 'local':
      return createLocalStorage(env.STORAGE_LOCAL_DIR);
    case 's3': {
      const {
        S3_ENDPOINT: endpoint,
        S3_REGION: region,
        S3_BUCKET_PUBLIC: publicBucket,
        S3_BUCKET_PRIVATE: privateBucket,
        S3_ACCESS_KEY_ID: accessKeyId,
        S3_SECRET_ACCESS_KEY: secretAccessKey,
      } = env;
      // loadApiEnv already enforces these; this guard keeps the types honest.
      if (
        !endpoint ||
        !region ||
        !publicBucket ||
        !privateBucket ||
        !accessKeyId ||
        !secretAccessKey
      )
        throw new StorageNotConfiguredError('STORAGE_DRIVER=s3 requires the S3_* settings.');
      return createS3Storage({
        endpoint,
        region,
        publicBucket,
        privateBucket,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
        publicObjectAcl: env.S3_PUBLIC_OBJECT_ACL,
      });
    }
  }
}
