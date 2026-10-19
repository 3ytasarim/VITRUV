/**
 * Content-based detection of website media (magic bytes) plus dimensions/duration.
 *
 * The declared Content-Type of an upload is never trusted on its own: the bytes must match an
 * allowed format. Parsing is bounds-checked and dependency-free; it reads container headers only
 * and never decodes or executes media.
 */
export interface SniffResult {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif' | 'video/mp4' | 'video/webm';
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Video sample-entry codecs found in an MP4 (e.g. avc1, hvc1). Empty for other formats. */
  videoCodecs: string[];
}

/** HEVC/H.265 sample entries — not reliably playable in browsers. */
export const HEVC_CODECS = new Set(['hvc1', 'hev1', 'dvh1', 'dvhe']);

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  start < 0 || start + length > bytes.length
    ? ''
    : String.fromCharCode(...bytes.subarray(start, start + length));

function reader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inRange = (offset: number, size: number) => offset >= 0 && offset + size <= bytes.length;
  return {
    u8: (o: number) => (inRange(o, 1) ? view.getUint8(o) : null),
    u16be: (o: number) => (inRange(o, 2) ? view.getUint16(o) : null),
    u16le: (o: number) => (inRange(o, 2) ? view.getUint16(o, true) : null),
    u24le: (o: number) =>
      inRange(o, 3) ? view.getUint16(o, true) + (view.getUint8(o + 2) << 16) : null,
    u32be: (o: number) => (inRange(o, 4) ? view.getUint32(o) : null),
    u32le: (o: number) => (inRange(o, 4) ? view.getUint32(o, true) : null),
    u64be: (o: number) => (inRange(o, 8) ? Number(view.getBigUint64(o)) : null),
  };
}

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

function sniffPng(bytes: Uint8Array): SniffResult | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b) || ascii(bytes, 12, 4) !== 'IHDR') return null;
  const r = reader(bytes);
  return {
    mimeType: 'image/png',
    width: positive(r.u32be(16)),
    height: positive(r.u32be(20)),
    durationMs: null,
    videoCodecs: [],
  };
}

function sniffJpeg(bytes: Uint8Array): SniffResult | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const r = reader(bytes);
  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image / start of scan
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = r.u16be(offset + 2);
    if (length === null || length < 2) break;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      height = positive(r.u16be(offset + 5));
      width = positive(r.u16be(offset + 7));
      break;
    }
    offset += 2 + length;
  }
  return { mimeType: 'image/jpeg', width, height, durationMs: null, videoCodecs: [] };
}

function sniffWebp(bytes: Uint8Array): SniffResult | null {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  const r = reader(bytes);
  const chunk = ascii(bytes, 12, 4);
  let width: number | null = null;
  let height: number | null = null;
  if (chunk === 'VP8 ') {
    width = positive((r.u16le(26) ?? 0) & 0x3fff);
    height = positive((r.u16le(28) ?? 0) & 0x3fff);
  } else if (chunk === 'VP8L') {
    const bits = r.u32le(21);
    if (bits !== null) {
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
  } else if (chunk === 'VP8X') {
    const w = r.u24le(24);
    const h = r.u24le(27);
    width = w === null ? null : w + 1;
    height = h === null ? null : h + 1;
  }
  return { mimeType: 'image/webp', width, height, durationMs: null, videoCodecs: [] };
}

interface Box {
  type: string;
  /** First byte of the box payload. */
  start: number;
  end: number;
}

/** Iterates ISO-BMFF boxes between `start` and `end` (bounds-checked). */
function* boxes(bytes: Uint8Array, start: number, end: number): Generator<Box> {
  const r = reader(bytes);
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard++ < 10_000) {
    let size = r.u32be(offset) ?? 0;
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      size = r.u64be(offset + 8) ?? 0;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

const child = (bytes: Uint8Array, parent: Box, type: string): Box | undefined => {
  for (const box of boxes(bytes, parent.start, parent.end)) if (box.type === type) return box;
  return undefined;
};

function sniffIsoBmff(bytes: Uint8Array): SniffResult | null {
  if (ascii(bytes, 4, 4) !== 'ftyp') return null;
  const top = [...boxes(bytes, 0, bytes.length)];
  const ftyp = top.find((b) => b.type === 'ftyp');
  if (!ftyp) return null;
  const brands = [ascii(bytes, ftyp.start, 4)];
  for (let o = ftyp.start + 8; o + 4 <= ftyp.end; o += 4) brands.push(ascii(bytes, o, 4));
  const r = reader(bytes);

  if (brands.includes('avif') || brands.includes('avis')) {
    // Image spatial extent ('ispe') lives in meta/iprp/ipco; take the first one.
    let width: number | null = null;
    let height: number | null = null;
    for (let o = ftyp.end; o + 16 <= bytes.length; o++) {
      if (ascii(bytes, o, 4) === 'ispe') {
        width = positive(r.u32be(o + 8));
        height = positive(r.u32be(o + 12));
        break;
      }
    }
    return { mimeType: 'image/avif', width, height, durationMs: null, videoCodecs: [] };
  }

  // QuickTime (.mov) and still-image HEIF containers are not website video formats.
  const major = brands[0] ?? '';
  if (major === 'qt  ' || ['heic', 'heix', 'mif1', 'msf1'].includes(major)) return null;

  let durationMs: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  const videoCodecs: string[] = [];
  const moov = top.find((b) => b.type === 'moov');
  if (moov) {
    const mvhd = child(bytes, moov, 'mvhd');
    if (mvhd) {
      const version = r.u8(mvhd.start);
      const timescale = r.u32be(mvhd.start + (version === 1 ? 20 : 12));
      const duration = version === 1 ? r.u64be(mvhd.start + 24) : r.u32be(mvhd.start + 16);
      if (timescale && duration !== null) durationMs = positive((duration / timescale) * 1000);
    }
    for (const trak of boxes(bytes, moov.start, moov.end)) {
      if (trak.type !== 'trak') continue;
      const tkhd = child(bytes, trak, 'tkhd');
      const stsd = ['mdia', 'minf', 'stbl', 'stsd'].reduce<Box | undefined>(
        (box, type) => (box ? child(bytes, box, type) : undefined),
        trak,
      );
      const hdlr = (() => {
        const mdia = child(bytes, trak, 'mdia');
        return mdia ? child(bytes, mdia, 'hdlr') : undefined;
      })();
      const isVideo = hdlr ? ascii(bytes, hdlr.start + 8, 4) === 'vide' : false;
      if (!isVideo) continue;
      if (stsd) {
        for (const entry of boxes(bytes, stsd.start + 8, stsd.end)) videoCodecs.push(entry.type);
      }
      if (tkhd && width === null) {
        const base = tkhd.start + (r.u8(tkhd.start) === 1 ? 88 : 76);
        width = positive((r.u32be(base) ?? 0) / 65536);
        height = positive((r.u32be(base + 4) ?? 0) / 65536);
      }
    }
  }
  return { mimeType: 'video/mp4', width, height, durationMs, videoCodecs };
}

function sniffWebm(bytes: Uint8Array): SniffResult | null {
  if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    return null;
  }
  // DocType element (0x4282) must say "webm" (Matroska .mkv is not accepted).
  const head = ascii(bytes, 0, Math.min(bytes.length, 64));
  if (!head.includes('webm')) return null;
  // Dimensions/duration need a full EBML parser — deliberately left out (stored as unknown).
  return { mimeType: 'video/webm', width: null, height: null, durationMs: null, videoCodecs: [] };
}

/** Detects an allowed website media format from its bytes, or returns null. */
export function sniffMedia(bytes: Uint8Array): SniffResult | null {
  if (bytes.length < 12) return null;
  return (
    sniffPng(bytes) ??
    sniffJpeg(bytes) ??
    sniffWebp(bytes) ??
    sniffIsoBmff(bytes) ??
    sniffWebm(bytes)
  );
}
