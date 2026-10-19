import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { MediaVisibility } from '@vitruv/shared';
import { localPathFor } from './local-storage';
import type { ObjectHead } from './object-storage';

/**
 * Copy of the local media store (`STORAGE_LOCAL_DIR`, layout `<dir>/<visibility>/<storage_key>`)
 * into S3-compatible object storage — used once when a server moves from the local driver to
 * STORAGE_DRIVER=s3.
 *
 *  - Source of truth is `media_assets` (read-only): every row is checked, nothing is guessed.
 *  - The S3 object key is the UNCHANGED storage_key (it already starts with `public/…` /
 *    `private/…`); the local visibility folder is only part of the local path (`localPathFor`
 *    is the driver's own mapping, so it can never end up in the key twice).
 *  - Content-Type comes from media_assets.mime_type; sizes are verified locally (vs. the DB)
 *    and remotely after the upload (HEAD).
 *  - Idempotent: objects that already exist with the same size and type are skipped; anything
 *    different is reported as a conflict and left untouched unless explicitly overwritten.
 *  - Local files are NEVER deleted or modified.
 */
export interface MigrationAsset {
  id: string;
  storageKey: string;
  visibility: MediaVisibility;
  mimeType: string;
  sizeBytes: number;
}

export interface MigrationTarget {
  head(key: string, visibility: MediaVisibility): Promise<ObjectHead | null>;
  upload(input: {
    key: string;
    visibility: MediaVisibility;
    filePath: string;
    sizeBytes: number;
    contentType: string;
  }): Promise<void>;
}

export type MigrationStatus =
  | 'would-upload' // dry-run: would be copied
  | 'uploaded' // copied and verified
  | 'already-present' // same size + type in the bucket → skipped
  | 'missing-local' // DB row without a local file
  | 'size-mismatch-local' // local file size ≠ media_assets.size_bytes
  | 'conflict-remote' // bucket has a different object under this key (not overwritten)
  | 'verify-failed' // uploaded, but HEAD shows a different size/type
  | 'failed'; // provider/network error

export interface MigrationItem {
  assetId: string;
  key: string;
  visibility: MediaVisibility;
  contentType: string;
  sizeBytes: number;
  localSizeBytes: number | null;
  remote: ObjectHead | null;
  status: MigrationStatus;
  error?: string;
}

export interface MigrationReport {
  dryRun: boolean;
  remoteChecked: boolean;
  items: MigrationItem[];
  totals: Record<MigrationStatus, { count: number; bytes: number }>;
  expected: { count: number; bytes: number };
  orphans: string[];
}

export const MIGRATION_PROBLEMS: readonly MigrationStatus[] = [
  'missing-local',
  'size-mismatch-local',
  'conflict-remote',
  'verify-failed',
  'failed',
];

const STATUSES: MigrationStatus[] = [
  'would-upload',
  'uploaded',
  'already-present',
  ...MIGRATION_PROBLEMS,
];

const sameObject = (remote: ObjectHead, size: number, contentType: string) =>
  remote.sizeBytes === size && (remote.contentType ?? '') === contentType;

const safeMessage = (error: unknown) => {
  const e = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const status = e?.$metadata?.httpStatusCode ? ` (HTTP ${e.$metadata.httpStatusCode})` : '';
  return `${e?.name ?? 'Error'}${status}`.slice(0, 120);
};

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index] as T);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function migrateLocalMedia(options: {
  assets: MigrationAsset[];
  localDir: string;
  /** null = no bucket access (dry-run without credentials): only the local side is verified. */
  target: MigrationTarget | null;
  dryRun: boolean;
  concurrency?: number;
  overwriteMismatched?: boolean;
  onItem?: (item: MigrationItem, index: number, total: number) => void;
}): Promise<MigrationReport> {
  const { assets, localDir, target, dryRun } = options;
  if (!dryRun && !target) throw new Error('A storage target is required unless --dry-run.');
  const remote = target;
  let done = 0;

  const items = await mapLimit(assets, options.concurrency ?? 4, async (asset) => {
    const base = {
      assetId: asset.id,
      key: asset.storageKey,
      visibility: asset.visibility,
      contentType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    };
    const finish = (item: MigrationItem) => {
      options.onItem?.(item, ++done, assets.length);
      return item;
    };
    let filePath: string;
    try {
      filePath = localPathFor(localDir, asset.storageKey, asset.visibility);
    } catch (error) {
      return finish({
        ...base,
        localSizeBytes: null,
        remote: null,
        status: 'failed',
        error: safeMessage(error),
      });
    }
    const local = await stat(filePath).then(
      (s) => (s.isFile() ? s.size : null),
      () => null,
    );
    if (local === null)
      return finish({ ...base, localSizeBytes: null, remote: null, status: 'missing-local' });
    if (local !== asset.sizeBytes) {
      return finish({
        ...base,
        localSizeBytes: local,
        remote: null,
        status: 'size-mismatch-local',
      });
    }
    try {
      const existing = remote ? await remote.head(asset.storageKey, asset.visibility) : null;
      if (existing && sameObject(existing, local, asset.mimeType)) {
        return finish({
          ...base,
          localSizeBytes: local,
          remote: existing,
          status: 'already-present',
        });
      }
      if (existing && !options.overwriteMismatched) {
        return finish({
          ...base,
          localSizeBytes: local,
          remote: existing,
          status: 'conflict-remote',
        });
      }
      if (dryRun || !remote) {
        return finish({ ...base, localSizeBytes: local, remote: existing, status: 'would-upload' });
      }
      await remote.upload({
        key: asset.storageKey,
        visibility: asset.visibility,
        filePath,
        sizeBytes: local,
        contentType: asset.mimeType,
      });
      const after = await remote.head(asset.storageKey, asset.visibility);
      const ok = after !== null && sameObject(after, local, asset.mimeType);
      return finish({
        ...base,
        localSizeBytes: local,
        remote: after,
        status: ok ? 'uploaded' : 'verify-failed',
      });
    } catch (error) {
      return finish({
        ...base,
        localSizeBytes: local,
        remote: null,
        status: 'failed',
        error: safeMessage(error),
      });
    }
  });

  const totals = Object.fromEntries(
    STATUSES.map((s) => [s, { count: 0, bytes: 0 }]),
  ) as MigrationReport['totals'];
  for (const item of items) {
    totals[item.status].count += 1;
    totals[item.status].bytes += item.sizeBytes;
  }
  return {
    dryRun,
    remoteChecked: target !== null,
    items,
    totals,
    expected: {
      count: assets.length,
      bytes: assets.reduce((sum, a) => sum + a.sizeBytes, 0),
    },
    orphans: await findOrphans(localDir, assets),
  };
}

/** Local files that no media_assets row points to (reported only — never deleted). */
export async function findOrphans(localDir: string, assets: MigrationAsset[]): Promise<string[]> {
  const root = resolve(localDir);
  const known = new Set(assets.map((a) => localPathFor(localDir, a.storageKey, a.visibility)));
  const orphans: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && !entry.name.endsWith('.meta.json') && !known.has(full)) {
        orphans.push(relative(root, full).split(sep).join('/'));
      }
    }
  };
  for (const visibility of ['public', 'private']) await walk(join(root, visibility));
  return orphans.sort();
}
