import Busboy from 'busboy';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { AppError } from '../../lib/errors';

/**
 * Streaming multipart receiver for large media uploads (videos up to several hundred MiB).
 *
 * The request body is never buffered: it flows request → byte counter → busboy → temp file on
 * disk with backpressure, so memory stays bounded (a few stream buffers) no matter how large the
 * file is. Limits are enforced while streaming — the total body (incl. multipart framing) and the
 * single file part — and the upload is aborted with 413 as soon as one is exceeded. The temp
 * file has a random server-side name; the client's file name is returned for display only.
 */
export interface StagedUpload {
  /** Temp file holding exactly the uploaded bytes (private to the API process). */
  path: string;
  sizeBytes: number;
  declaredType: string;
  fileName: string | undefined;
  fields: Readonly<Record<string, string>>;
  /** Positional reads for content sniffing (bounded by the caller). */
  read(position: number, length: number): Promise<Uint8Array>;
  /** Removes the temp file. Idempotent; always call it (finally). */
  discard(): Promise<void>;
}

export interface ReceiveOptions {
  tmpDir: string;
  /** Largest accepted file part. */
  maxFileBytes: number;
  /** Largest accepted request body, multipart overhead included. */
  maxBodyBytes: number;
  /** Text fields to keep (others are ignored). */
  fieldNames: readonly string[];
}

const tooLarge = (maxFileBytes: number) =>
  AppError.payloadTooLarge(`Datei zu groß (max. ${Math.floor(maxFileBytes / 1024 / 1024)} MB).`);

class UploadAborted extends Error {}

export async function receiveMultipartUpload(
  request: Request,
  options: ReceiveOptions,
): Promise<StagedUpload> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw AppError.badRequest('multipart/form-data erwartet.');
  }
  // Early rejection when the client announces an oversized body (nothing is read).
  const declaredLength = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declaredLength) && declaredLength > options.maxBodyBytes) {
    throw tooLarge(options.maxFileBytes);
  }
  if (!request.body) throw AppError.badRequest('Leere Anfrage.');

  await mkdir(options.tmpDir, { recursive: true, mode: 0o700 });
  const path = join(options.tmpDir, `${randomUUID()}.upload`);
  const discard = () => rm(path, { force: true });

  let failure: AppError | null = null;
  const fail = (error: AppError) => {
    failure ??= error;
  };

  let bodyBytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bodyBytes += chunk.length;
      if (bodyBytes > options.maxBodyBytes) {
        fail(tooLarge(options.maxFileBytes));
        done(new UploadAborted('body limit'));
        return;
      }
      done(null, chunk);
    },
  });

  let busboy: Busboy.Busboy;
  try {
    busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: {
        files: 1,
        // busboy reports 'limit' when the file REACHES fileSize: +1 so a file of exactly
        // maxFileBytes is accepted and only a larger one is rejected.
        fileSize: options.maxFileBytes + 1,
        fields: 8,
        fieldSize: 4 * 1024,
        parts: 10,
        headerPairs: 20,
      },
    });
  } catch {
    throw AppError.badRequest('Ungültige multipart-Anfrage.');
  }

  const fields: Record<string, string> = {};
  let file: { declaredType: string; fileName: string | undefined; done: Promise<number> } | null =
    null;

  busboy.on('field', (name, value) => {
    if (options.fieldNames.includes(name) && !(name in fields)) fields[name] = value;
  });
  busboy.on('file', (name, stream, info) => {
    if (name !== 'file' || file) {
      // Unexpected or second file part: drain it, the request is rejected below.
      fail(AppError.badRequest('Genau eine Datei im Feld "file" erwartet.'));
      stream.resume();
      return;
    }
    stream.on('limit', () => {
      fail(tooLarge(options.maxFileBytes));
      // Stop reading the rest of the oversized body right away.
      stream.destroy(new UploadAborted('file limit'));
      counter.destroy(new UploadAborted('file limit'));
    });
    const sink = createWriteStream(path, { flags: 'wx', mode: 0o600 });
    file = {
      declaredType: info.mimeType,
      fileName: info.filename,
      done: pipeline(stream, sink).then(() => sink.bytesWritten),
    };
    // Avoid an unhandled rejection while the outer pipeline is still running.
    file.done.catch(() => undefined);
  });
  busboy.on('filesLimit', () => fail(AppError.badRequest('Nur eine Datei pro Upload.')));
  busboy.on('fieldsLimit', () => fail(AppError.badRequest('Zu viele Formularfelder.')));
  busboy.on('partsLimit', () => fail(AppError.badRequest('Zu viele Formularteile.')));

  try {
    const source = Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>);
    await pipeline(source, counter, busboy);
    const received = file as {
      declaredType: string;
      fileName: string | undefined;
      done: Promise<number>;
    } | null;
    const sizeBytes = received ? await received.done : 0;
    if (failure) throw failure;
    if (!received) throw AppError.badRequest('Feld "file" fehlt.');
    return {
      path,
      sizeBytes,
      declaredType: received.declaredType,
      fileName: received.fileName,
      fields,
      read: async (position, length) => {
        const handle = await open(path, 'r');
        try {
          const buffer = new Uint8Array(length);
          const { bytesRead } = await handle.read(buffer, 0, length, position);
          return buffer.subarray(0, bytesRead);
        } finally {
          await handle.close();
        }
      },
      discard,
    };
  } catch (error) {
    await discard();
    if (failure) throw failure;
    if (error instanceof AppError) throw error;
    // Client disconnected, truncated or malformed body: nothing was stored.
    throw AppError.badRequest('Upload abgebrochen oder unvollständig. Bitte erneut versuchen.');
  }
}
