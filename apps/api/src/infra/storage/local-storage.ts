import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { MediaVisibility } from '@vitruv/shared';
import type {
  ByteRange,
  ObjectHead,
  ObjectStorage,
  ObjectStream,
  PutObjectInput,
  PutObjectStreamInput,
  StoredObject,
} from './object-storage';
import { assertSafeStorageKey } from './storage-keys';

/**
 * Development driver: stores objects on local disk under `<baseDir>/<visibility>/<key>`.
 * Mirrors the two-bucket layout of production so code paths stay identical. Because the key
 * itself already starts with `public/…` / `private/…`, files live at e.g.
 * `.storage/public/public/website/2026/10/<uuid>.webp` — the FIRST folder is this driver's
 * visibility folder and is never part of the key (see scripts/storage-migrate.ts).
 * Content type is kept in a sidecar file because the filesystem has no object metadata.
 */
export function localPathFor(baseDir: string, key: string, visibility: MediaVisibility): string {
  assertSafeStorageKey(key);
  const root = resolve(baseDir);
  const target = resolve(root, visibility.toLowerCase(), ...key.split('/'));
  if (!target.startsWith(root + sep)) throw new Error('Invalid storage key.');
  return target;
}

export function createLocalStorage(baseDir: string): ObjectStorage {
  const pathFor = (key: string, visibility: MediaVisibility) =>
    localPathFor(baseDir, key, visibility);

  const fileSize = async (path: string) =>
    stat(path).then(
      (s) => (s.isFile() ? s.size : null),
      () => null,
    );
  const contentTypeOf = (path: string) =>
    readFile(`${path}.meta.json`, 'utf8').then(
      (raw) => (JSON.parse(raw) as { contentType?: string }).contentType ?? null,
      () => null,
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

    async putStream({ key, body, sizeBytes, contentType, visibility }: PutObjectStreamInput) {
      const target = pathFor(key, visibility);
      await mkdir(dirname(target), { recursive: true });
      // Written next to the target and renamed only when complete: a reader never sees a
      // partial file under the real key (rename is atomic on the same filesystem).
      const partial = `${target}.${randomUUID()}.partial`;
      try {
        await pipeline(body, createWriteStream(partial, { flags: 'wx', mode: 0o600 }));
        const written = (await stat(partial)).size;
        if (written !== sizeBytes) {
          throw new Error(`Incomplete write (${written} of ${sizeBytes} bytes).`);
        }
        await writeFile(`${target}.meta.json`, JSON.stringify({ contentType }));
        await rename(partial, target);
      } catch (error) {
        await rm(partial, { force: true });
        await rm(`${target}.meta.json`, { force: true });
        throw error;
      }
      return { key, sizeBytes };
    },

    async get(key, visibility): Promise<StoredObject | null> {
      const target = pathFor(key, visibility);
      if ((await fileSize(target)) === null) return null;
      const body = new Uint8Array(await readFile(target));
      return { body, contentType: await contentTypeOf(target), sizeBytes: body.byteLength };
    },

    async head(key, visibility): Promise<ObjectHead | null> {
      const target = pathFor(key, visibility);
      const size = await fileSize(target);
      return size === null ? null : { sizeBytes: size, contentType: await contentTypeOf(target) };
    },

    async getStream(key, visibility, range?: ByteRange): Promise<ObjectStream | null> {
      const target = pathFor(key, visibility);
      const size = await fileSize(target);
      if (size === null) return null;
      const stream = createReadStream(
        target,
        range ? { start: range.start, end: range.end } : undefined,
      );
      return {
        body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
        contentType: await contentTypeOf(target),
        sizeBytes: size,
        range: range ?? null,
      };
    },

    exists: async (key, visibility) => (await fileSize(pathFor(key, visibility))) !== null,

    async delete(key, visibility) {
      const target = pathFor(key, visibility);
      await rm(target, { force: true });
      await rm(`${target}.meta.json`, { force: true });
    },

    // No signed URLs on local disk: callers stream after their own authorisation check.
    signedUrl: async () => null,
  };
}
