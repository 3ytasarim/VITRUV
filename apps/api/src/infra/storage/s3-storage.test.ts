import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from './object-storage';
import { createS3Storage, type S3StorageConfig } from './s3-storage';

// Fictional configuration — never real credentials in tests.
const config: S3StorageConfig = {
  endpoint: 'https://fsn1.example-objectstorage.test',
  region: 'fsn1',
  publicBucket: 'pub-bucket',
  privateBucket: 'priv-bucket',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

type Cmd = { input: Record<string, unknown> };
const providerError = (name: string, status: number) =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

const body = (bytes: Uint8Array) => ({
  transformToByteArray: async () => bytes,
  transformToWebStream: () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
});

function setup(reply: (command: unknown) => unknown = () => ({})) {
  const send = vi.fn(async (command: unknown) => {
    const out = reply(command);
    if (out instanceof Error) throw out;
    return out;
  });
  const presign = vi.fn(async (_command: GetObjectCommand, _expiresIn: number) => 'https://signed');
  return { send, presign, storage: createS3Storage(config, { send, presign }) };
}

describe('s3 storage driver', () => {
  it('routes PUBLIC and PRIVATE to separate buckets with the unchanged key', async () => {
    const { send, storage } = setup();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put({
      key: 'public/website/2026/10/a.webp',
      body: bytes,
      contentType: 'image/webp',
      visibility: 'PUBLIC',
    });
    await storage.put({
      key: 'private/nutrition/2026/10/b.pdf',
      body: bytes,
      contentType: 'application/pdf',
      visibility: 'PRIVATE',
    });

    const [pub, priv] = send.mock.calls.map(([c]) => c as Cmd);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(pub?.input).toMatchObject({
      Bucket: 'pub-bucket',
      Key: 'public/website/2026/10/a.webp',
      ContentType: 'image/webp',
      ContentLength: 3,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(pub?.input.ACL).toBeUndefined();
    expect(priv?.input).toMatchObject({
      Bucket: 'priv-bucket',
      Key: 'private/nutrition/2026/10/b.pdf',
      CacheControl: 'private, no-store',
    });
  });

  it('sets the optional public ACL only on PUBLIC uploads', async () => {
    const send = vi.fn(async () => ({}));
    const storage = createS3Storage({ ...config, publicObjectAcl: 'public-read' }, { send });
    const input = { body: new Uint8Array([1]), contentType: 'image/jpeg' };
    await storage.put({ ...input, key: 'public/a.jpg', visibility: 'PUBLIC' });
    await storage.put({ ...input, key: 'private/a.jpg', visibility: 'PRIVATE' });
    const calls = send.mock.calls as unknown as [Cmd][];
    expect(calls[0]?.[0].input.ACL).toBe('public-read');
    expect(calls[1]?.[0].input.ACL).toBeUndefined();
  });

  it('reads objects and maps "not found" to null / false', async () => {
    const { storage } = setup((command) => {
      const key = (command as Cmd).input.Key;
      if (key === 'public/missing.jpg') {
        return command instanceof HeadObjectCommand
          ? providerError('NotFound', 404)
          : providerError('NoSuchKey', 404);
      }
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 3, ContentType: 'image/jpeg' };
      }
      return { Body: body(new Uint8Array([7, 8, 9])), ContentType: 'image/jpeg' };
    });

    expect(await storage.get('public/a.jpg', 'PUBLIC')).toEqual({
      body: new Uint8Array([7, 8, 9]),
      contentType: 'image/jpeg',
      sizeBytes: 3,
    });
    expect(await storage.head('public/a.jpg', 'PUBLIC')).toEqual({
      sizeBytes: 3,
      contentType: 'image/jpeg',
    });
    expect(await storage.exists('public/a.jpg', 'PUBLIC')).toBe(true);
    expect(await storage.get('public/missing.jpg', 'PUBLIC')).toBeNull();
    expect(await storage.head('public/missing.jpg', 'PUBLIC')).toBeNull();
    expect(await storage.exists('public/missing.jpg', 'PUBLIC')).toBe(false);
    expect(await storage.getStream('public/missing.jpg', 'PUBLIC')).toBeNull();
  });

  it('streams with a byte range and reports the total size from Content-Range', async () => {
    const { send, storage } = setup(() => ({
      Body: body(new Uint8Array([2, 3])),
      ContentType: 'video/mp4',
      ContentLength: 2,
      ContentRange: 'bytes 2-3/1000',
    }));
    const object = await storage.getStream('public/v.mp4', 'PUBLIC', { start: 2, end: 3 });
    expect((send.mock.calls[0]?.[0] as Cmd).input).toMatchObject({
      Bucket: 'pub-bucket',
      Key: 'public/v.mp4',
      Range: 'bytes=2-3',
    });
    expect(object).toMatchObject({
      contentType: 'video/mp4',
      sizeBytes: 1000,
      range: { start: 2, end: 3 },
    });
    const chunks = await new Response(object?.body).arrayBuffer();
    expect([...new Uint8Array(chunks)]).toEqual([2, 3]);
  });

  it('treats an unsatisfiable range as missing (route answers 416 before)', async () => {
    const { storage } = setup(() => providerError('InvalidRange', 416));
    expect(await storage.getStream('public/v.mp4', 'PUBLIC', { start: 5, end: 9 })).toBeNull();
  });

  it('presigns private downloads with a clamped TTL and download headers', async () => {
    const { presign, storage } = setup();
    const url = await storage.signedUrl('private/nutrition/b.pdf', 'PRIVATE', {
      expiresInSeconds: 99_999,
      contentDisposition: 'attachment; filename="plan.pdf"',
      contentType: 'application/pdf',
    });
    expect(url).toBe('https://signed');
    const [command, expiresIn] = presign.mock.calls[0] ?? [];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command?.input).toMatchObject({
      Bucket: 'priv-bucket',
      Key: 'private/nutrition/b.pdf',
      ResponseContentDisposition: 'attachment; filename="plan.pdf"',
      ResponseContentType: 'application/pdf',
      ResponseCacheControl: 'private, no-store',
    });
    expect(expiresIn).toBe(3600);
  });

  it('deletes from the bucket of the visibility', async () => {
    const { send, storage } = setup();
    await storage.delete('private/x.pdf', 'PRIVATE');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((send.mock.calls[0]?.[0] as Cmd).input).toEqual({
      Bucket: 'priv-bucket',
      Key: 'private/x.pdf',
    });
  });

  it('wraps provider failures without leaking details', async () => {
    const { storage } = setup(() => providerError('AccessDenied', 403));
    const failure = storage.get('public/a.jpg', 'PUBLIC');
    await expect(failure).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(failure).rejects.toThrow('Object storage get failed.');
    await expect(
      storage.put({
        key: 'public/a.jpg',
        body: new Uint8Array([1]),
        contentType: 'image/jpeg',
        visibility: 'PUBLIC',
      }),
    ).rejects.not.toThrow(/test-secret|test-key/);
  });

  it('refuses unsafe keys before calling the provider', async () => {
    const { send, storage } = setup();
    await expect(storage.get('../etc/passwd', 'PUBLIC')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
