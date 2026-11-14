import { Worker } from 'node:worker_threads';
import { AppError } from '../../lib/errors';
import type { HeicJob, HeicResult } from './heic-worker';

/**
 * HEIC/HEIF (iPhone photo) → JPEG for the media library. Browsers can not display HEIC, so it
 * is never stored: the API converts it and stores a normal JPEG asset.
 *
 * - Runs in a worker thread (libheif/WASM decodes synchronously) — the API stays responsive.
 * - One conversion at a time per process: a 48 MP photo needs ~200 MB of pixel memory, so
 *   parallel conversions are queued instead of multiplying that.
 * - Resolution cap (MAX_PIXELS) and a timeout bound memory and time per photo.
 */
export const HEIC_MAX_PIXELS = 64_000_000; // 8000 × 8000; iPhone 48 MP photos are 8064 × 6048
export const HEIC_TIMEOUT_MS = 120_000;
export const HEIC_JPEG_QUALITY = 88;

export interface HeicConversion {
  jpeg: Uint8Array;
  width: number;
  height: number;
}
export type HeicConverter = (heic: Uint8Array) => Promise<HeicConversion>;

/** Worker entry next to this module: dist/heic-worker.js (build) or heic-worker.ts (tsx dev). */
function workerUrl(): URL {
  const here = import.meta.url;
  return new URL(here.endsWith('.ts') ? './heic-worker.ts' : './heic-worker.js', here);
}

function runWorker(job: HeicJob): Promise<HeicResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl(), {
      workerData: job,
      transferList: [job.buffer],
      // libheif prints parser messages to stdout — keep them out of the API's JSON log.
      stdout: true,
      stderr: true,
    });
    worker.stdout.resume();
    worker.stderr.resume();
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('HEIC conversion timed out.'));
    }, HEIC_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once('message', (result: HeicResult) => {
      finish();
      resolve(result);
    });
    worker.once('error', (error) => {
      finish();
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`HEIC worker exited with ${code}.`));
    });
  });
}

let queue: Promise<unknown> = Promise.resolve();

export const convertHeicToJpeg: HeicConverter = (heic) => {
  const run = async (): Promise<HeicConversion> => {
    const buffer = heic.buffer.slice(heic.byteOffset, heic.byteOffset + heic.byteLength);
    let result: HeicResult;
    try {
      result = await runWorker({
        buffer: buffer as ArrayBuffer,
        maxPixels: HEIC_MAX_PIXELS,
        quality: HEIC_JPEG_QUALITY,
      });
    } catch {
      throw AppError.badRequest('Das HEIC-Foto konnte nicht umgewandelt werden.');
    }
    if (!result.ok) {
      throw AppError.badRequest(
        result.reason === 'TOO_MANY_PIXELS'
          ? 'Das HEIC-Foto ist zu groß (max. 64 Megapixel).'
          : 'Das HEIC-Foto konnte nicht gelesen werden. Bitte als JPEG exportieren und hochladen.',
      );
    }
    return { jpeg: new Uint8Array(result.jpeg), width: result.width, height: result.height };
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
};
