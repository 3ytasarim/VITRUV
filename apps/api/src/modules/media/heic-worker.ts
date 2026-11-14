/**
 * Worker thread: HEIC/HEIF still image → JPEG (see heic-convert.ts).
 *
 * Runs off the main thread because libheif (WASM) decodes synchronously and a 12–48 MP photo
 * takes seconds. One worker per conversion, terminated afterwards, so the WASM heap is freed.
 * Decoding: libheif via heic-decode (applies the image's rotation/mirroring). Encoding: sharp.
 * The output carries NO metadata from the original (EXIF/GPS/maker notes are dropped) — only a
 * colour profile tag so iPhone (Display P3) colours stay correct.
 */
import { parentPort, workerData } from 'node:worker_threads';
import heicDecode from 'heic-decode';
import sharp from 'sharp';
import { colourProfileOf } from './heic-colour';

export interface HeicJob {
  buffer: ArrayBuffer;
  maxPixels: number;
  quality: number;
}

export type HeicResult =
  | { ok: true; jpeg: ArrayBuffer; width: number; height: number }
  | { ok: false; reason: 'TOO_MANY_PIXELS' | 'UNREADABLE'; message: string };

async function convert(job: HeicJob): Promise<HeicResult> {
  const bytes = new Uint8Array(job.buffer);
  let images: Awaited<ReturnType<typeof heicDecode.all>>;
  try {
    images = await heicDecode.all({ buffer: bytes });
  } catch {
    return { ok: false, reason: 'UNREADABLE', message: 'HEIC could not be read.' };
  }
  try {
    const primary = images[0];
    if (!primary) return { ok: false, reason: 'UNREADABLE', message: 'No image in HEIC.' };
    if (primary.width * primary.height > job.maxPixels) {
      return { ok: false, reason: 'TOO_MANY_PIXELS', message: 'HEIC resolution too large.' };
    }
    const { width, height, data } = await primary.decode();
    const output = await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .withIccProfile(colourProfileOf(bytes))
      .jpeg({ quality: job.quality, mozjpeg: true })
      .toBuffer();
    const jpeg = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
    return { ok: true, jpeg: jpeg as ArrayBuffer, width, height };
  } catch {
    return { ok: false, reason: 'UNREADABLE', message: 'HEIC could not be converted.' };
  } finally {
    images.dispose();
  }
}

const job = workerData as Partial<HeicJob> | null;
if (parentPort && job?.buffer instanceof ArrayBuffer) {
  const port = parentPort;
  void convert(job as HeicJob).then((result) =>
    port.postMessage(result, result.ok ? [result.jpeg] : []),
  );
}
