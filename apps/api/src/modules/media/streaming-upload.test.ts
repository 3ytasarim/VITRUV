import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { adminMediaAssetSchema, apiErrorSchema } from '@vitruv/contracts';
import type { DbExecutor } from '@vitruv/db';
import { WEBSITE_MEDIA_MAX_BYTES, mediaUploadMaxBodyBytes } from '@vitruv/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, principalResolver, testUrls } from '../../../test/helpers';
import { heic, html, mp4, png } from '../../../test/media-fixtures';
import { localPathFor, type ObjectStorage } from '../../infra/storage/index';
import { createLocalStorage } from '../../infra/storage/local-storage';
import type { MediaServiceDeps } from './media.service';

/**
 * Streaming upload pipeline end to end (route → multipart stream → temp file → validation →
 * storage stream → metadata row), with synthetic bodies generated on the fly: a 500 MiB upload
 * is produced from one reused 1 MiB zero buffer, so the test itself stays small in memory and
 * any memory growth measured here belongs to the upload pipeline.
 */
const MiB = 1024 * 1024;
const enc = (s: string) => new TextEncoder().encode(s);
const zeroChunk = new Uint8Array(MiB);

interface BodyOptions {
  fileType: string;
  /** Bytes at the start of the file (format header). */
  head: Uint8Array;
  /** Bytes at the end of the file (e.g. an MP4 moov box without faststart). */
  tail?: Uint8Array;
  /** Total file size; the middle is zero padding. */
  size: number;
  fileName?: string;
  altText?: string;
  fieldName?: string;
  /** Error the stream after this many body bytes (client disconnect). */
  failAfter?: number;
  /** Pull blocks until this promise resolves (keeps an upload "in flight"). */
  gate?: Promise<void>;
}

function multipartBody(options: BodyOptions) {
  const boundary = `----vitruvtest${randomUUID().replaceAll('-', '')}`;
  const tail = options.tail ?? new Uint8Array(0);
  const pre = enc(
    (options.altText !== undefined
      ? `--${boundary}\r\nContent-Disposition: form-data; name="altText"\r\n\r\n${options.altText}\r\n`
      : '') +
      `--${boundary}\r\nContent-Disposition: form-data; name="${options.fieldName ?? 'file'}"; filename="${options.fileName ?? 'clip.mp4'}"\r\nContent-Type: ${options.fileType}\r\n\r\n`,
  );
  const post = enc(`\r\n--${boundary}--\r\n`);
  const padding = options.size - options.head.length - tail.length;
  if (padding < 0) throw new Error('size smaller than head + tail');
  const total = pre.length + options.size + post.length;
  const state = { pulled: 0, total };

  const pieces: (Uint8Array | number)[] = [pre, options.head, padding, tail, post];
  let index = 0;
  let paddingLeft = padding;
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (options.gate) await options.gate;
        for (;;) {
          if (index >= pieces.length) {
            controller.close();
            return;
          }
          const piece = pieces[index];
          let chunk: Uint8Array;
          if (typeof piece === 'number') {
            if (paddingLeft === 0) {
              index++;
              continue;
            }
            const n = Math.min(MiB, paddingLeft);
            paddingLeft -= n;
            chunk = n === MiB ? zeroChunk : zeroChunk.subarray(0, n);
          } else {
            index++;
            if (!piece || piece.length === 0) continue;
            chunk = piece;
          }
          if (options.failAfter !== undefined && state.pulled + chunk.length > options.failAfter) {
            controller.error(new Error('connection reset by peer'));
            return;
          }
          state.pulled += chunk.length;
          controller.enqueue(chunk);
          return;
        }
      },
      // No read-ahead: bytes are only produced when the server actually reads them.
    },
    { highWaterMark: 0 },
  );
  return { stream, boundary, state };
}

function uploadRequest(path: string, body: ReturnType<typeof multipartBody>, headers = {}) {
  return new Request(`http://api.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${body.boundary}`, ...headers },
    body: body.stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

/** MP4 header: ftyp + moov, then an mdat box spanning the rest of the file (faststart layout). */
function faststartMp4(size: number) {
  const meta = mp4({ width: 1920, height: 1080, durationMs: 60_000, codec: 'avc1' });
  const mdatSize = size - meta.length;
  const head = new Uint8Array(meta.length + 8);
  head.set(meta);
  new DataView(head.buffer).setUint32(meta.length, mdatSize);
  head.set(enc('mdat'), meta.length + 4);
  return head;
}

/** MP4 without faststart: ftyp + mdat …, moov at the very END of the file. */
function moovAtEndMp4(size: number) {
  const meta = mp4({ width: 1280, height: 720, durationMs: 42_000, codec: 'avc1' });
  const ftypSize = new DataView(meta.buffer).getUint32(0);
  const ftyp = meta.subarray(0, ftypSize);
  const moov = meta.subarray(ftypSize);
  const head = new Uint8Array(ftyp.length + 8);
  head.set(ftyp);
  new DataView(head.buffer).setUint32(ftyp.length, size - ftyp.length - moov.length);
  head.set(enc('mdat'), ftyp.length + 4);
  return { head, tail: moov };
}

function fakeDb() {
  const rows: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          const row = { ...values, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
          rows.push(row);
          return [row];
        },
      }),
    }),
  } as unknown as DbExecutor;
  return { db, rows };
}

// A real gc() lets the sampler measure LIVE memory: without it, already-released 1 MiB chunks
// still count until V8 happens to collect them, which says nothing about retention.
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

/** Peak growth of live heap + Buffer memory while `run` executes (sampled after gc()). */
async function measurePeakMemory<T>(run: () => T | Promise<T>) {
  const used = () => {
    gc();
    const m = process.memoryUsage();
    return m.heapUsed + m.arrayBuffers;
  };
  const baseline = used();
  let peak = baseline;
  const timer = setInterval(() => {
    peak = Math.max(peak, used());
  }, 25);
  try {
    const result = await run();
    peak = Math.max(peak, used());
    return { result, growth: peak - baseline };
  } finally {
    clearInterval(timer);
  }
}

let storageDir: string;
let uploadDir: string;

beforeAll(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'vitruv-stream-storage-'));
  uploadDir = await mkdtemp(join(tmpdir(), 'vitruv-stream-uploads-'));
});
afterAll(async () => {
  await rm(storageDir, { recursive: true, force: true });
  await rm(uploadDir, { recursive: true, force: true });
});
afterEach(async () => {
  // Every test must leave no staged temp file behind.
  expect(await readdir(uploadDir)).toEqual([]);
  await rm(join(storageDir, 'public'), { recursive: true, force: true });
});

function setup(
  options: {
    role?: 'ADMIN' | 'COACH' | 'CLIENT' | null;
    limits?: MediaServiceDeps['limits'];
    maxConcurrent?: number;
    storage?: ObjectStorage;
    convertHeic?: MediaServiceDeps['convertHeic'];
  } = {},
) {
  const { db, rows } = fakeDb();
  const storage = options.storage ?? createLocalStorage(storageDir);
  const role = options.role === undefined ? 'ADMIN' : options.role;
  const app = buildTestApp({
    ...(role ? { auth: principalResolver(role, `u-${role.toLowerCase()}`) } : {}),
    media: {
      db,
      storage,
      urls: testUrls,
      limits: options.limits ?? WEBSITE_MEDIA_MAX_BYTES,
      uploads: { tmpDir: uploadDir, maxConcurrent: options.maxConcurrent ?? 4 },
      ...(options.convertHeic ? { convertHeic: options.convertHeic } : {}),
    },
  });
  return { app, rows, storage };
}

async function storedFiles(): Promise<string[]> {
  const root = join(storageDir, 'public');
  const found = await readdir(root, { recursive: true }).catch(() => [] as string[]);
  return found.filter((name) => /\.(mp4|webm|png|jpg|webp|avif|partial)$/.test(name));
}

describe('streaming media upload — accepted sizes (bounded memory)', () => {
  it('accepts a 20 MiB image (exactly the image limit)', async () => {
    const { app, rows } = setup();
    const body = multipartBody({
      fileType: 'image/png',
      head: png(4000, 3000),
      size: 20 * MiB,
      fileName: 'foto.png',
      altText: 'Testbild',
    });
    const res = await app.request(uploadRequest('/v1/admin/media', body));
    expect(res.status).toBe(201);
    const asset = adminMediaAssetSchema.parse(await res.json());
    expect(asset).toMatchObject({
      kind: 'IMAGE',
      sizeBytes: 20 * MiB,
      width: 4000,
      altText: 'Testbild',
    });
    expect(rows).toHaveLength(1);
  });

  it.each([100, 300, 500])(
    'streams a %i MiB MP4 to storage with bounded memory',
    async (sizeMiB) => {
      const { app, rows } = setup();
      const size = sizeMiB * MiB;
      const body = multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size });
      const { result: res, growth } = await measurePeakMemory(() =>
        app.request(uploadRequest('/v1/admin/media', body)),
      );
      expect(res.status).toBe(201);
      const asset = adminMediaAssetSchema.parse(await res.json());
      expect(asset).toMatchObject({
        kind: 'VIDEO',
        mimeType: 'video/mp4',
        sizeBytes: size,
        width: 1920,
        height: 1080,
        durationMs: 60_000,
      });
      // The stored object is complete and under the server-generated key.
      const key = String(rows[0]?.storageKey);
      expect(key).toMatch(/^public\/website\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.mp4$/);
      expect((await stat(localPathFor(storageDir, key, 'PUBLIC'))).size).toBe(size);
      // Memory does not grow with the file: far below the file size.
      expect(growth).toBeLessThan(32 * MiB);
    },
    180_000,
  );

  it('accepts an MP4 whose moov box sits at the END of the file (no faststart)', async () => {
    const { app } = setup();
    const size = 24 * MiB;
    const { head, tail } = moovAtEndMp4(size);
    const res = await app.request(
      uploadRequest('/v1/admin/media', multipartBody({ fileType: 'video/mp4', head, tail, size })),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ width: 1280, height: 720, durationMs: 42_000 });
  });

  it('uses the training library with the same pipeline', async () => {
    const { app, rows } = setup();
    const size = 8 * MiB;
    const res = await app.request(
      uploadRequest(
        '/v1/admin/training/media',
        multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size }),
      ),
    );
    expect(res.status).toBe(201);
    expect(String(rows[0]?.storageKey)).toMatch(/^public\/training-video\//);
  });
});

describe('streaming media upload — rejections', () => {
  it('rejects an announced over-limit body with 413 before reading it', async () => {
    const { app, rows } = setup();
    const size = 8 * MiB;
    const body = multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size });
    const res = await app.request(
      uploadRequest('/v1/admin/media', body, {
        'Content-Length': String(mediaUploadMaxBodyBytes(WEBSITE_MEDIA_MAX_BYTES) + 1),
      }),
    );
    expect(res.status).toBe(413);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.state.pulled).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it('stops reading and answers 413 when a streamed file exceeds the limit', async () => {
    const limits = { IMAGE: 1 * MiB, VIDEO: 4 * MiB };
    const { app, rows } = setup({ limits });
    const size = 64 * MiB;
    const body = multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size });
    const res = await app.request(uploadRequest('/v1/admin/media', body));
    expect(res.status).toBe(413);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    // Aborted early — the rest of the 64 MiB body was never pulled.
    expect(body.state.pulled).toBeLessThan(16 * MiB);
    expect(rows).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });

  it('rejects an image above the image limit with 413 even though videos may be larger', async () => {
    const { app, rows } = setup();
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'image/png', head: png(10, 10), size: 20 * MiB + 1 }),
      ),
    );
    expect(res.status).toBe(413);
    expect(rows).toHaveLength(0);
  });

  it('rejects a disallowed MIME type', async () => {
    const { app, rows } = setup();
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'application/x-msdownload', head: html(), size: 1024 }),
      ),
    );
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.message).toMatch(/Dateityp nicht erlaubt/);
    expect(rows).toHaveLength(0);
  });

  it('rejects content whose signature does not match the declared type', async () => {
    const { app, rows } = setup();
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'video/mp4', head: html(), size: 2 * MiB }),
      ),
    );
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.message).toMatch(/Dateiinhalt/);
    expect(rows).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });

  it('rejects a body without a "file" part', async () => {
    const { app } = setup();
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'image/png', head: png(1, 1), size: 1024, fieldName: 'other' }),
      ),
    );
    expect(res.status).toBe(400);
  });

  it.each([
    [null, '/v1/admin/media', 401],
    ['CLIENT', '/v1/admin/media', 403],
    ['COACH', '/v1/admin/media', 403],
    ['CLIENT', '/v1/admin/training/media', 403],
  ] as const)('role %s on %s → %i without reading the body', async (role, path, status) => {
    const { app, rows } = setup({ role });
    const size = 8 * MiB;
    const body = multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size });
    const res = await app.request(uploadRequest(path, body));
    expect(res.status).toBe(status);
    expect(body.state.pulled).toBe(0);
    expect(rows).toHaveLength(0);
  });
});

describe('streaming media upload — failures leave nothing behind', () => {
  it('an interrupted upload (client disconnect) stores no object, no row, no temp file', async () => {
    const { app, rows } = setup();
    const size = 100 * MiB;
    const body = multipartBody({
      fileType: 'video/mp4',
      head: faststartMp4(size),
      size,
      failAfter: 30 * MiB,
    });
    const res = await app.request(uploadRequest('/v1/admin/media', body));
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.message).toMatch(/abgebrochen/);
    expect(rows).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });

  it('a storage failure mid-transfer publishes nothing (no partial object, no row)', async () => {
    const local = createLocalStorage(storageDir);
    const failing: ObjectStorage = {
      ...local,
      putStream: (input) => {
        let seen = 0;
        input.body.on('data', (chunk: Buffer) => {
          seen += chunk.length;
          if (seen > 5 * MiB) input.body.destroy(new Error('disk full'));
        });
        return local.putStream(input);
      },
    };
    const { app, rows } = setup({ storage: failing });
    const size = 32 * MiB;
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size }),
      ),
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(rows).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });
});

describe('streaming media upload — concurrency', () => {
  it('handles 4 concurrent 100 MiB uploads with bounded memory', async () => {
    const { app, rows } = setup({ maxConcurrent: 4 });
    const size = 100 * MiB;
    const { result, growth } = await measurePeakMemory(() =>
      Promise.all(
        Array.from({ length: 4 }, () =>
          app.request(
            uploadRequest(
              '/v1/admin/media',
              multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size }),
            ),
          ),
        ),
      ),
    );
    expect(result.map((res) => res.status)).toEqual([201, 201, 201, 201]);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((row) => row.storageKey)).size).toBe(4);
    expect(growth).toBeLessThan(64 * MiB);
  }, 180_000);

  it('answers 429 beyond the configured number of simultaneous uploads', async () => {
    const { app, rows } = setup({ maxConcurrent: 2 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const size = 2 * MiB;
    const slow = () =>
      app.request(
        uploadRequest(
          '/v1/admin/media',
          multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size, gate }),
        ),
      );
    const first = slow();
    const second = slow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const third = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: 'video/mp4', head: faststartMp4(size), size }),
      ),
    );
    expect(third.status).toBe(429);
    release();
    expect((await first).status).toBe(201);
    expect((await second).status).toBe(201);
    expect(rows).toHaveLength(2);
  });
});

describe('HEIC upload (iPhone photo → JPEG)', () => {
  // Stand-in for the libheif worker (no HEIC encoder exists to build a real test photo):
  // it receives the uploaded bytes and returns a small JPEG.
  const fakeJpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const converter = () => {
    const calls: Uint8Array[] = [];
    const convert = async (bytes: Uint8Array) => {
      calls.push(bytes);
      return { jpeg: fakeJpeg(), width: 4032, height: 3024 };
    };
    return { calls, convert };
  };

  it.each([
    ['image/heic', 'IMG_0420.HEIC'],
    ['image/heif', 'IMG_0420.heif'],
    ['application/octet-stream', 'IMG_0420.heic'],
  ])('converts %j (%s) and stores a JPEG asset', async (declaredType, fileName) => {
    const { calls, convert } = converter();
    const { app, rows } = setup({ convertHeic: convert });
    const head = heic(4032, 3024);
    const size = 3 * MiB;
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({ fileType: declaredType, head, size, fileName }),
      ),
    );
    expect(res.status).toBe(201);
    const asset = adminMediaAssetSchema.parse(await res.json());
    expect(asset).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/jpeg',
      fileName: 'IMG_0420.jpg',
      width: 4032,
      height: 3024,
      sizeBytes: fakeJpeg().length,
    });
    expect(calls[0]?.length).toBe(size);
    const key = String(rows[0]?.storageKey);
    expect(key).toMatch(/.jpg$/);
    expect((await stat(localPathFor(storageDir, key, 'PUBLIC'))).size).toBe(fakeJpeg().length);
  });

  it('accepts a .heic part sent without any Content-Type (Windows browsers)', async () => {
    const { convert } = converter();
    const { app } = setup({ convertHeic: convert });
    const boundary = 'heicboundary';
    const head = heic(100, 80);
    const body = new Uint8Array([
      // No Content-Type header on the file part (what some browsers send for .heic).
      ...enc(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="IMG_1.HEIC"\r\n\r\n`,
      ),
      ...head,
      ...enc(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.request('/v1/admin/media', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });
    const json: unknown = await res.json();
    expect({ status: res.status, json }).toMatchObject({
      status: 201,
      json: { mimeType: 'image/jpeg', fileName: 'IMG_1.jpg' },
    });
  });

  it('rejects a HEIF image sequence and a fake .heic', async () => {
    const { calls, convert } = converter();
    const { app, rows } = setup({ convertHeic: convert });
    for (const head of [heic(10, 10, 1, 'msf1'), png(10, 10)]) {
      const res = await app.request(
        uploadRequest(
          '/v1/admin/media',
          multipartBody({ fileType: 'image/heic', head, size: 4096, fileName: 'x.heic' }),
        ),
      );
      expect(res.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect(rows).toHaveLength(0);
  });

  it('a failed conversion stores nothing', async () => {
    const { app, rows } = setup({
      convertHeic: async () => {
        throw new Error('decoder crashed');
      },
    });
    const res = await app.request(
      uploadRequest(
        '/v1/admin/media',
        multipartBody({
          fileType: 'image/heic',
          head: heic(10, 10),
          size: 4096,
          fileName: 'a.heic',
        }),
      ),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(rows).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });
});
