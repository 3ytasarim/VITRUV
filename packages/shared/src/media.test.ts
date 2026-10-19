import { describe, expect, it } from 'vitest';
import { mediaKindForMimeType, websiteMediaKindForMimeType } from './media';

describe('mediaKindForMimeType', () => {
  it('maps allow-listed types to their kind', () => {
    expect(mediaKindForMimeType('image/webp')).toBe('IMAGE');
    expect(mediaKindForMimeType('VIDEO/MP4')).toBe('VIDEO');
    expect(mediaKindForMimeType('application/pdf')).toBe('DOCUMENT');
  });

  it('rejects executable or unknown content', () => {
    expect(mediaKindForMimeType('text/html')).toBeNull();
    expect(mediaKindForMimeType('image/svg+xml')).toBeNull();
    expect(mediaKindForMimeType('application/x-msdownload')).toBeNull();
  });
});

describe('websiteMediaKindForMimeType', () => {
  it('accepts only browser-ready editorial formats', () => {
    expect(websiteMediaKindForMimeType('image/avif')).toBe('IMAGE');
    expect(websiteMediaKindForMimeType('video/webm')).toBe('VIDEO');
    expect(websiteMediaKindForMimeType('video/quicktime')).toBeNull();
    expect(websiteMediaKindForMimeType('application/pdf')).toBeNull();
    expect(websiteMediaKindForMimeType('image/svg+xml')).toBeNull();
  });
});
