import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalStorage } from './local-storage';
import { assertSafeStorageKey, buildStorageKey } from './storage-keys';

describe('buildStorageKey', () => {
  it('builds a dated, unguessable key from server-controlled parts only', () => {
    const key = buildStorageKey({
      visibility: 'PUBLIC',
      purpose: 'website',
      extension: '.WEBP',
      now: new Date('2026-10-15T00:00:00Z'),
      id: '0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f',
    });
    expect(key).toBe('public/website/2026/10/0b7f3c1e-8a2d-4f6b-9c3e-2d1a5b7c9e0f.webp');
  });

  it('rejects dangerous extensions', () => {
    expect(() =>
      buildStorageKey({ visibility: 'PRIVATE', purpose: 'nutrition', extension: 'pdf/../../x' }),
    ).toThrow();
  });

  it.each(['../etc/passwd', '/abs/key', 'a//b', 'a/./b', 'A/b', 'a\\b', ''])(
    'rejects unsafe key %j',
    (key) => {
      expect(() => assertSafeStorageKey(key)).toThrow();
    },
  );
});

describe('local storage driver', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vitruv-storage-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips an object with its content type', async () => {
    const storage = createLocalStorage(dir);
    const body = new TextEncoder().encode('%PDF-1.7 fictional');
    await storage.put({
      key: 'private/nutrition/2026/10/a.pdf',
      body,
      contentType: 'application/pdf',
      visibility: 'PRIVATE',
    });

    expect(await storage.exists('private/nutrition/2026/10/a.pdf', 'PRIVATE')).toBe(true);
    const stored = await storage.get('private/nutrition/2026/10/a.pdf', 'PRIVATE');
    expect(stored?.contentType).toBe('application/pdf');
    expect(stored?.sizeBytes).toBe(body.byteLength);

    await storage.delete('private/nutrition/2026/10/a.pdf', 'PRIVATE');
    expect(await storage.get('private/nutrition/2026/10/a.pdf', 'PRIVATE')).toBeNull();
  });

  it('keeps public and private objects apart', async () => {
    const storage = createLocalStorage(dir);
    await storage.put({
      key: 'x/y.jpg',
      body: new Uint8Array([1]),
      contentType: 'image/jpeg',
      visibility: 'PRIVATE',
    });
    expect(await storage.exists('x/y.jpg', 'PUBLIC')).toBe(false);
  });

  it('refuses path traversal', async () => {
    const storage = createLocalStorage(dir);
    await expect(storage.get('../outside.txt', 'PUBLIC')).rejects.toThrow('Invalid storage key.');
  });
});
