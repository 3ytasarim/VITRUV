import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { MediaVisibility } from '@vitruv/shared';
import type { ObjectStorage, PutObjectInput, StoredObject } from './object-storage';
import { assertSafeStorageKey } from './storage-keys';

/**
 * Development-only driver: stores objects on local disk under `<baseDir>/<visibility>/<key>`.
 * Mirrors the two-bucket layout of production so code paths stay identical.
 * Content type is kept in a sidecar file because the filesystem has no object metadata.
 */
export function createLocalStorage(baseDir: string): ObjectStorage {
  const root = resolve(baseDir);

  const pathFor = (key: string, visibility: MediaVisibility): string => {
    assertSafeStorageKey(key);
    const target = resolve(root, visibility.toLowerCase(), ...key.split('/'));
    if (!target.startsWith(root + sep)) throw new Error('Invalid storage key.');
    return target;
  };

  const exists = async (path: string) =>
    stat(path).then(
      (s) => s.isFile(),
      () => false,
    );

  return {
    driver: 'local',

    async put({ key, body, contentType, visibility }: PutObjectInput) {
      const target = pathFor(key, visibility);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
      await writeFile(`${target}.meta.json`, JSON.stringify({ contentType }));
      return { key, sizeBytes: body.byteLength };
    },

    async get(key, visibility): Promise<StoredObject | null> {
      const target = pathFor(key, visibility);
      if (!(await exists(target))) return null;
      const body = new Uint8Array(await readFile(target));
      const meta = await readFile(`${target}.meta.json`, 'utf8').then(
        (raw) => JSON.parse(raw) as { contentType?: string },
        () => ({ contentType: undefined }),
      );
      return { body, contentType: meta.contentType ?? null, sizeBytes: body.byteLength };
    },

    exists: (key, visibility) => exists(pathFor(key, visibility)),

    async delete(key, visibility) {
      const target = pathFor(key, visibility);
      await rm(target, { force: true });
      await rm(`${target}.meta.json`, { force: true });
    },
  };
}
