import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MediaVisibility } from '@vitruv/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localPathFor } from './local-storage';
import { migrateLocalMedia, type MigrationAsset, type MigrationTarget } from './migration';
import type { ObjectHead } from './object-storage';

/** In-memory bucket pair that records every upload. */
function fakeTarget(options: { corruptUploads?: boolean; failKey?: string } = {}) {
  const objects = new Map<string, ObjectHead>();
  const uploads: { key: string; visibility: MediaVisibility; contentType: string }[] = [];
  const id = (key: string, visibility: MediaVisibility) => `${visibility}:${key}`;
  const target: MigrationTarget = {
    async head(key, visibility) {
      return objects.get(id(key, visibility)) ?? null;
    },
    async upload({ key, visibility, filePath, contentType }) {
      if (key === options.failKey) {
        throw Object.assign(new Error('secret detail https://bucket/key?X-Amz-Signature=abc'), {
          name: 'InternalError',
          $metadata: { httpStatusCode: 500 },
        });
      }
      const size = (await stat(filePath)).size;
      uploads.push({ key, visibility, contentType });
      objects.set(id(key, visibility), {
        sizeBytes: options.corruptUploads ? size - 1 : size,
        contentType,
      });
    },
  };
  return { target, objects, uploads, id };
}

describe('migrateLocalMedia', () => {
  let dir: string;
  const write = async (asset: MigrationAsset, bytes = asset.sizeBytes) => {
    const path = localPathFor(dir, asset.storageKey, asset.visibility);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, new Uint8Array(bytes));
  };
  const image: MigrationAsset = {
    id: 'a1',
    storageKey: 'public/website/2026/10/a.webp',
    visibility: 'PUBLIC',
    mimeType: 'image/webp',
    sizeBytes: 10,
  };
  const pdf: MigrationAsset = {
    id: 'a2',
    storageKey: 'private/nutrition/2026/10/b.pdf',
    visibility: 'PRIVATE',
    mimeType: 'application/pdf',
    sizeBytes: 20,
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vitruv-migrate-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the local layout <dir>/<visibility>/<key> and keeps the key unchanged', async () => {
    await write(image);
    await write(pdf);
    // the visibility folder appears once in the path and never in the object key
    expect(localPathFor(dir, image.storageKey, 'PUBLIC')).toBe(
      join(dir, 'public', 'public', 'website', '2026', '10', 'a.webp'),
    );
    const { target, uploads } = fakeTarget();
    const report = await migrateLocalMedia({
      assets: [image, pdf],
      localDir: dir,
      target,
      dryRun: false,
    });
    expect(report.totals.uploaded).toEqual({ count: 2, bytes: 30 });
    expect([...uploads].sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      {
        key: 'private/nutrition/2026/10/b.pdf',
        visibility: 'PRIVATE',
        contentType: 'application/pdf',
      },
      { key: 'public/website/2026/10/a.webp', visibility: 'PUBLIC', contentType: 'image/webp' },
    ]);
    expect(report.expected).toEqual({ count: 2, bytes: 30 });
  });

  it('dry-run uploads nothing', async () => {
    await write(image);
    const { target, uploads } = fakeTarget();
    const report = await migrateLocalMedia({
      assets: [image],
      localDir: dir,
      target,
      dryRun: true,
    });
    expect(report.totals['would-upload'].count).toBe(1);
    expect(uploads).toHaveLength(0);
  });

  it('dry-run works without bucket access (local check only)', async () => {
    await write(image);
    const report = await migrateLocalMedia({
      assets: [image, pdf],
      localDir: dir,
      target: null,
      dryRun: true,
    });
    expect(report.remoteChecked).toBe(false);
    expect(report.totals['would-upload'].count).toBe(1);
    expect(report.totals['missing-local'].count).toBe(1);
    await expect(
      migrateLocalMedia({ assets: [image], localDir: dir, target: null, dryRun: false }),
    ).rejects.toThrow();
  });

  it('is idempotent: a second run skips identical objects', async () => {
    await write(image);
    await write(pdf);
    const { target, uploads } = fakeTarget();
    await migrateLocalMedia({ assets: [image, pdf], localDir: dir, target, dryRun: false });
    const again = await migrateLocalMedia({
      assets: [image, pdf],
      localDir: dir,
      target,
      dryRun: false,
    });
    expect(again.totals['already-present'].count).toBe(2);
    expect(uploads).toHaveLength(2);
  });

  it('reports missing files and DB size mismatches instead of uploading them', async () => {
    await write(image, 9);
    const { target, uploads } = fakeTarget();
    const report = await migrateLocalMedia({
      assets: [image, pdf],
      localDir: dir,
      target,
      dryRun: false,
    });
    expect(report.items.map((i) => i.status)).toEqual(['size-mismatch-local', 'missing-local']);
    expect(report.items[0]?.localSizeBytes).toBe(9);
    expect(uploads).toHaveLength(0);
  });

  it('leaves a different remote object untouched unless overwrite is requested', async () => {
    await write(image);
    const { target, objects, id, uploads } = fakeTarget();
    objects.set(id(image.storageKey, 'PUBLIC'), { sizeBytes: 3, contentType: 'image/png' });
    const report = await migrateLocalMedia({
      assets: [image],
      localDir: dir,
      target,
      dryRun: false,
    });
    expect(report.items[0]?.status).toBe('conflict-remote');
    expect(uploads).toHaveLength(0);

    const forced = await migrateLocalMedia({
      assets: [image],
      localDir: dir,
      target,
      dryRun: false,
      overwriteMismatched: true,
    });
    expect(forced.items[0]?.status).toBe('uploaded');
  });

  it('verifies the upload and reports provider errors without details', async () => {
    await write(image);
    await write(pdf);
    const corrupt = await migrateLocalMedia({
      assets: [image],
      localDir: dir,
      target: fakeTarget({ corruptUploads: true }).target,
      dryRun: false,
    });
    expect(corrupt.items[0]?.status).toBe('verify-failed');

    const failing = await migrateLocalMedia({
      assets: [image, pdf],
      localDir: dir,
      target: fakeTarget({ failKey: pdf.storageKey }).target,
      dryRun: false,
    });
    expect(failing.items.map((i) => i.status)).toEqual(['uploaded', 'failed']);
    expect(failing.items[1]?.error).toBe('InternalError (HTTP 500)');
  });

  it('reports local files without a DB row and never deletes anything', async () => {
    await write(image);
    const stray = join(dir, 'public', 'public', 'website', 'stray.jpg');
    await writeFile(stray, new Uint8Array(1));
    await writeFile(`${localPathFor(dir, image.storageKey, 'PUBLIC')}.meta.json`, '{}');
    const report = await migrateLocalMedia({
      assets: [image],
      localDir: dir,
      target: fakeTarget().target,
      dryRun: false,
    });
    expect(report.orphans).toEqual(['public/public/website/stray.jpg']);
    expect(await readdir(join(dir, 'public', 'public', 'website'))).toContain('stray.jpg');
    expect((await stat(localPathFor(dir, image.storageKey, 'PUBLIC'))).size).toBe(10);
  });
});
