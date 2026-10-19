import type { ApiEnv } from '../../config/env';
import { createLocalStorage } from './local-storage';
import { type ObjectStorage, StorageNotConfiguredError } from './object-storage';

export * from './object-storage';
export * from './storage-keys';

/**
 * Selects the storage driver from validated env.
 * The S3-compatible driver is added once the provider is chosen (see docs/ARCHITECTURE.md,
 * "Object storage"); env validation for it already exists.
 */
export function createObjectStorage(env: ApiEnv): ObjectStorage {
  switch (env.STORAGE_DRIVER) {
    case 'local':
      return createLocalStorage(env.STORAGE_LOCAL_DIR);
    case 's3':
      throw new StorageNotConfiguredError(
        'STORAGE_DRIVER=s3 is reserved: the S3-compatible driver is implemented when the ' +
          'production storage provider is selected.',
      );
  }
}
