/**
 * Minimal, synthetic media headers for tests. They contain just enough structure for format
 * detection — no real images or videos (and no third-party or private material).
 */
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const text = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
const zeros = (n: number) => Array<number>(n).fill(0);

export const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());

/** ISO-BMFF box: size + type + payload. */
export const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat();
  return [...u32(8 + body.length), ...text(type), ...body];
};

export function png(width: number, height: number) {
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    u32(13),
    text('IHDR'),
    u32(width),
    u32(height),
    [8, 6, 0, 0, 0],
    zeros(4),
  );
}

export function jpeg(width: number, height: number) {
  return bytes(
    [0xff, 0xd8],
    [0xff, 0xe0, ...u16(16), ...text('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
    [0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3],
    zeros(9),
    [0xff, 0xd9],
  );
}

export function webpVp8x(width: number, height: number) {
  const w = width - 1;
  const h = height - 1;
  return bytes(
    text('RIFF'),
    u32(0),
    text('WEBP'),
    text('VP8X'),
    [10, 0, 0, 0],
    zeros(4),
    [w & 255, (w >> 8) & 255, (w >> 16) & 255],
    [h & 255, (h >> 8) & 255, (h >> 16) & 255],
  );
}

export function avif(width: number, height: number) {
  return bytes(
    box('ftyp', text('avif'), u32(0), text('mif1'), text('avif')),
    box('meta', zeros(4), box('iprp', box('ipco', box('ispe', zeros(4), u32(width), u32(height))))),
  );
}

/** MP4 with one video track: duration in ms, dimensions, codec fourcc (avc1, hvc1 …). */
export function mp4(options: { width: number; height: number; durationMs: number; codec: string }) {
  const timescale = 1000;
  const mvhd = box(
    'mvhd',
    [0, 0, 0, 0],
    zeros(8),
    u32(timescale),
    u32(options.durationMs),
    zeros(80),
  );
  const tkhd = box(
    'tkhd',
    [0, 0, 0, 3],
    zeros(72),
    u32(options.width * 65536),
    u32(options.height * 65536),
  );
  const hdlr = box('hdlr', zeros(4), zeros(4), text('vide'), zeros(12), [0]);
  const stsd = box('stsd', zeros(4), u32(1), box(options.codec, zeros(78)));
  const trak = box('trak', tkhd, box('mdia', hdlr, box('minf', box('stbl', stsd))));
  return bytes(
    box('ftyp', text('isom'), u32(512), text('isom'), text('mp41')),
    box('moov', mvhd, trak),
  );
}

export function quicktime() {
  return bytes(box('ftyp', text('qt  '), u32(0), text('qt  ')), box('moov', zeros(8)));
}

export function webm() {
  return bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], text('webm'), zeros(16));
}

export const html = () => bytes(text('<!doctype html><script>alert(1)</script>'));
export const svg = () => bytes(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
export const windowsExecutable = () => bytes(text('MZ'), zeros(62), text('PE'), zeros(16));
