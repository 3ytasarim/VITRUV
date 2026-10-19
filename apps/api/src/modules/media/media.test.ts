import { WEBSITE_MEDIA_MAX_BYTES } from '@vitruv/shared';
import { describe, expect, it } from 'vitest';
import {
  avif,
  html,
  jpeg,
  mp4,
  png,
  quicktime,
  svg,
  webm,
  webpVp8x,
  windowsExecutable,
} from '../../../test/media-fixtures';
import type { AppError } from '../../lib/errors';
import { sniffMedia } from './media-sniff';
import { sanitizeFileName, validateWebsiteUpload } from './media.service';

describe('sniffMedia', () => {
  it('detects images and reads their dimensions', () => {
    expect(sniffMedia(png(1600, 900))).toMatchObject({
      mimeType: 'image/png',
      width: 1600,
      height: 900,
    });
    expect(sniffMedia(jpeg(1080, 1350))).toMatchObject({
      mimeType: 'image/jpeg',
      width: 1080,
      height: 1350,
    });
    expect(sniffMedia(webpVp8x(2048, 1024))).toMatchObject({
      mimeType: 'image/webp',
      width: 2048,
      height: 1024,
    });
    expect(sniffMedia(avif(1200, 800))).toMatchObject({
      mimeType: 'image/avif',
      width: 1200,
      height: 800,
    });
  });

  it('reads MP4 duration, dimensions and video codec', () => {
    expect(
      sniffMedia(mp4({ width: 1920, height: 1080, durationMs: 12_500, codec: 'avc1' })),
    ).toEqual({
      mimeType: 'video/mp4',
      width: 1920,
      height: 1080,
      durationMs: 12_500,
      videoCodecs: ['avc1'],
    });
    expect(sniffMedia(webm())).toMatchObject({ mimeType: 'video/webm', width: null });
  });

  it('rejects markup, executables, QuickTime and truncated data', () => {
    expect(sniffMedia(html())).toBeNull();
    expect(sniffMedia(svg())).toBeNull();
    expect(sniffMedia(windowsExecutable())).toBeNull();
    expect(sniffMedia(quicktime())).toBeNull();
    expect(sniffMedia(new Uint8Array([0x89, 0x50]))).toBeNull();
    // Corrupt box sizes must not throw or loop.
    const corrupt = mp4({ width: 1, height: 1, durationMs: 1, codec: 'avc1' });
    corrupt.set([0xff, 0xff, 0xff, 0xff], 24);
    expect(() => sniffMedia(corrupt)).not.toThrow();
  });
});

describe('validateWebsiteUpload', () => {
  const limits = WEBSITE_MEDIA_MAX_BYTES;
  const reject = (input: Parameters<typeof validateWebsiteUpload>[0]) => {
    try {
      validateWebsiteUpload(input);
    } catch (error) {
      return error as AppError;
    }
    throw new Error('expected rejection');
  };

  it('accepts a valid image and derives the extension from its content', () => {
    const result = validateWebsiteUpload({
      bytes: png(10, 20),
      declaredType: 'image/png',
      fileName: 'Hero Bild.png',
      limits,
    });
    expect(result).toMatchObject({ kind: 'IMAGE', extension: 'png', fileName: 'Hero Bild.png' });
  });

  it('rejects types outside the website allow-list', () => {
    expect(
      reject({ bytes: svg(), declaredType: 'image/svg+xml', fileName: 'a.svg', limits }).status,
    ).toBe(400);
    expect(
      reject({ bytes: html(), declaredType: 'text/html', fileName: 'a.html', limits }).status,
    ).toBe(400);
    expect(
      reject({ bytes: quicktime(), declaredType: 'video/quicktime', fileName: 'a.mov', limits })
        .status,
    ).toBe(400);
  });

  it('rejects content that does not match the declared type', () => {
    const error = reject({
      bytes: windowsExecutable(),
      declaredType: 'image/png',
      fileName: 'x.png',
      limits,
    });
    expect(error.message).toMatch(/Dateiinhalt/);
    expect(
      reject({ bytes: jpeg(1, 1), declaredType: 'image/png', fileName: 'x.png', limits }).status,
    ).toBe(400);
  });

  it('enforces the per-kind size limit', () => {
    const error = reject({
      bytes: png(1, 1),
      declaredType: 'image/png',
      fileName: 'x.png',
      limits: { IMAGE: 10, VIDEO: 10 },
    });
    expect(error.status).toBe(413);
  });

  it('rejects HEVC video with a helpful message', () => {
    const error = reject({
      bytes: mp4({ width: 1920, height: 1080, durationMs: 1000, codec: 'hvc1' }),
      declaredType: 'video/mp4',
      fileName: 'clip.mp4',
      limits,
    });
    expect(error.message).toMatch(/HEVC/);
  });
});

describe('sanitizeFileName', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['C:\\Users\\x\\evil.png', 'evil.png'],
    ['..hidden.png', 'hidden.png'],
    ['bad\u0000name<>.jpg', 'badname.jpg'],
    ['', 'upload'],
    [undefined, 'upload'],
  ])('%j → %j', (raw, expected) => expect(sanitizeFileName(raw)).toBe(expected));

  it('bounds the length', () => {
    expect(sanitizeFileName(`${'a'.repeat(500)}.png`)).toHaveLength(180);
  });
});
