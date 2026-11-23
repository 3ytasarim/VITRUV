import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { schema, type DbExecutor } from '@vitruv/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ObjectStorage } from '../../infra/storage/index';
import { assertSafeStorageKey } from '../../infra/storage/storage-keys';

/**
 * Sprint 8B — migration of EXISTING public training videos to private storage
 * (docs/ios-training-sprint8a-private-media.md §6, steps D–H). Library code only: Sprint 8B
 * rehearses it on the isolated cluster with the local driver (test/sprint8b-media-privatize.pg.test.ts).
 * There is deliberately NO CLI wired to the root .env — running it against production storage
 * is a separate, owner-approved operation.
 *
 * Steps (each one idempotent, dry-run unless `apply: true`):
 *   1 inventory          PUBLIC TRAINING_VIDEO assets (website media never included)
 *   2 copy + verify      public object → `private/…` key; size AND sha256 compared
 *   3 flip               media_assets row → PRIVATE + new key (narrow WHERE: id, PUBLIC, old key)
 *   4 remove originals   public object deleted — only after the flip, only if the private copy
 *                        still verifies (destructive: separate call, separate approval)
 *   R rollback           flip back to PUBLIC while the public original still exists
 */
const { mediaAssets: M } = schema;

export interface PrivatizeAsset {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export type PrivatizeStatus =
  | 'would-copy'
  | 'copied-and-flipped'
  | 'already-private'
  | 'source-missing'
  | 'size-mismatch'
  | 'checksum-mismatch'
  | 'row-changed'
  | 'would-remove-original'
  | 'original-removed'
  | 'original-already-gone'
  | 'private-copy-invalid'
  | 'would-roll-back'
  | 'rolled-back'
  | 'public-original-missing'
  | 'not-private';

export interface PrivatizeItem {
  assetId: string;
  status: PrivatizeStatus;
  fromKey?: string;
  toKey?: string;
}

/** `public/training-video/…` → `private/training-video/…` (and back). */
export function privateKeyFor(publicKey: string): string {
  assertSafeStorageKey(publicKey);
  if (!publicKey.startsWith('public/training-video/')) {
    throw new Error('Not a public training video key.');
  }
  return `private/${publicKey.slice('public/'.length)}`;
}

export function publicKeyFor(privateKey: string): string {
  assertSafeStorageKey(privateKey);
  if (!privateKey.startsWith('private/training-video/')) {
    throw new Error('Not a private training video key.');
  }
  return `public/${privateKey.slice('private/'.length)}`;
}

/** Step 1 — read-only. */
export async function inventoryPublicTrainingVideos(db: DbExecutor): Promise<PrivatizeAsset[]> {
  return db
    .select({ id: M.id, storageKey: M.storageKey, mimeType: M.mimeType, sizeBytes: M.sizeBytes })
    .from(M)
    .where(and(eq(M.purpose, 'TRAINING_VIDEO'), eq(M.visibility, 'PUBLIC')))
    .orderBy(asc(M.createdAt), asc(M.id));
}

async function digest(
  storage: ObjectStorage,
  key: string,
  visibility: 'PUBLIC' | 'PRIVATE',
): Promise<{ sha256: string; size: number } | null> {
  const object = await storage.getStream(key, visibility);
  if (!object) return null;
  const hash = createHash('sha256');
  let size = 0;
  const reader = object.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
    size += value.byteLength;
  }
  return { sha256: hash.digest('hex'), size };
}

/** Steps 2 + 3. */
export async function privatizeTrainingVideos(options: {
  db: DbExecutor;
  storage: ObjectStorage;
  apply?: boolean;
  /** Limit to these assets (batches); default: the whole inventory. */
  assetIds?: readonly string[];
}): Promise<PrivatizeItem[]> {
  const { db, storage, apply = false } = options;
  const inventory = await inventoryPublicTrainingVideos(db);
  const wanted = options.assetIds ? new Set(options.assetIds) : null;
  const report: PrivatizeItem[] = [];
  if (wanted) {
    const privateOnes = await db
      .select({ id: M.id })
      .from(M)
      .where(
        and(
          inArray(M.id, [...wanted]),
          eq(M.purpose, 'TRAINING_VIDEO'),
          eq(M.visibility, 'PRIVATE'),
        ),
      );
    for (const row of privateOnes) report.push({ assetId: row.id, status: 'already-private' });
  }
  for (const asset of inventory) {
    if (wanted && !wanted.has(asset.id)) continue;
    const toKey = privateKeyFor(asset.storageKey);
    const base = { assetId: asset.id, fromKey: asset.storageKey, toKey };
    const source = await storage.head(asset.storageKey, 'PUBLIC');
    if (!source) {
      report.push({ ...base, status: 'source-missing' });
      continue;
    }
    if (source.sizeBytes !== asset.sizeBytes) {
      report.push({ ...base, status: 'size-mismatch' });
      continue;
    }
    if (!apply) {
      report.push({ ...base, status: 'would-copy' });
      continue;
    }
    const original = await digest(storage, asset.storageKey, 'PUBLIC');
    // re-run after a crash between copy and flip: the copy may already be there
    let copy = await digest(storage, toKey, 'PRIVATE');
    if (!copy || copy.sha256 !== original?.sha256) {
      const stream = await storage.getStream(asset.storageKey, 'PUBLIC');
      if (!stream || !original) {
        report.push({ ...base, status: 'source-missing' });
        continue;
      }
      await storage.putStream({
        key: toKey,
        body: Readable.fromWeb(stream.body as unknown as NodeWebReadableStream<Uint8Array>),
        sizeBytes: asset.sizeBytes,
        contentType: asset.mimeType,
        visibility: 'PRIVATE',
      });
      copy = await digest(storage, toKey, 'PRIVATE');
    }
    if (!original || !copy || copy.size !== original.size) {
      report.push({ ...base, status: 'size-mismatch' });
      continue;
    }
    if (copy.sha256 !== original.sha256) {
      report.push({ ...base, status: 'checksum-mismatch' });
      continue;
    }
    const flipped = await db
      .update(M)
      .set({ visibility: 'PRIVATE', storageKey: toKey })
      .where(
        and(eq(M.id, asset.id), eq(M.visibility, 'PUBLIC'), eq(M.storageKey, asset.storageKey)),
      )
      .returning({ id: M.id });
    report.push({ ...base, status: flipped.length === 1 ? 'copied-and-flipped' : 'row-changed' });
  }
  return report;
}

/** Step 4 — DESTRUCTIVE (public originals). Only flipped assets whose private copy verifies. */
export async function removePublicOriginals(options: {
  db: DbExecutor;
  storage: ObjectStorage;
  assetIds: readonly string[];
  apply?: boolean;
}): Promise<PrivatizeItem[]> {
  const { db, storage, apply = false } = options;
  if (options.assetIds.length === 0) return [];
  const rows = await db
    .select({
      id: M.id,
      storageKey: M.storageKey,
      visibility: M.visibility,
      sizeBytes: M.sizeBytes,
    })
    .from(M)
    .where(and(inArray(M.id, [...options.assetIds]), eq(M.purpose, 'TRAINING_VIDEO')));
  const report: PrivatizeItem[] = [];
  for (const row of rows) {
    if (row.visibility !== 'PRIVATE' || !row.storageKey.startsWith('private/training-video/')) {
      report.push({ assetId: row.id, status: 'not-private' });
      continue;
    }
    const fromKey = publicKeyFor(row.storageKey);
    const base = { assetId: row.id, fromKey, toKey: row.storageKey };
    const copy = await storage.head(row.storageKey, 'PRIVATE');
    if (!copy || copy.sizeBytes !== row.sizeBytes) {
      report.push({ ...base, status: 'private-copy-invalid' });
      continue;
    }
    if (!(await storage.exists(fromKey, 'PUBLIC'))) {
      report.push({ ...base, status: 'original-already-gone' });
      continue;
    }
    if (!apply) {
      report.push({ ...base, status: 'would-remove-original' });
      continue;
    }
    await storage.delete(fromKey, 'PUBLIC');
    report.push({ ...base, status: 'original-removed' });
  }
  return report;
}

/** Rollback of step 3 — possible only while the public original exists (before step 4). */
export async function rollbackPrivatization(options: {
  db: DbExecutor;
  storage: ObjectStorage;
  assetIds: readonly string[];
  apply?: boolean;
}): Promise<PrivatizeItem[]> {
  const { db, storage, apply = false } = options;
  if (options.assetIds.length === 0) return [];
  const rows = await db
    .select({ id: M.id, storageKey: M.storageKey, visibility: M.visibility })
    .from(M)
    .where(and(inArray(M.id, [...options.assetIds]), eq(M.purpose, 'TRAINING_VIDEO')));
  const report: PrivatizeItem[] = [];
  for (const row of rows) {
    if (row.visibility !== 'PRIVATE' || !row.storageKey.startsWith('private/training-video/')) {
      report.push({ assetId: row.id, status: 'not-private' });
      continue;
    }
    const toKey = publicKeyFor(row.storageKey);
    const base = { assetId: row.id, fromKey: row.storageKey, toKey };
    if (!(await storage.exists(toKey, 'PUBLIC'))) {
      report.push({ ...base, status: 'public-original-missing' });
      continue;
    }
    if (!apply) {
      report.push({ ...base, status: 'would-roll-back' });
      continue;
    }
    const back = await db
      .update(M)
      .set({ visibility: 'PUBLIC', storageKey: toKey })
      .where(and(eq(M.id, row.id), eq(M.visibility, 'PRIVATE'), eq(M.storageKey, row.storageKey)))
      .returning({ id: M.id });
    // the private copy is kept (harmless, unreferenced) — cleanup is a separate decision
    report.push({ ...base, status: back.length === 1 ? 'rolled-back' : 'row-changed' });
  }
  return report;
}
