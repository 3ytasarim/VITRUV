/** Colour space of a HEIF photo, from its `colr` property (used by heic-worker.ts). */
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/**
 * Colour space of the photo from its `colr` property: nclx colour_primaries 12 = Display P3
 * (iPhone), or an embedded ICC profile whose description mentions P3. Everything else → sRGB.
 */
export function colourProfileOf(bytes: Uint8Array): 'p3' | 'srgb' {
  for (let i = 4; i + 12 <= bytes.length; i++) {
    if (bytes[i] !== 0x63 || ascii(bytes, i, 4) !== 'colr') continue; // 'c'
    const type = ascii(bytes, i + 4, 4);
    if (type === 'nclx') {
      const primaries = ((bytes[i + 8] ?? 0) << 8) | (bytes[i + 9] ?? 0);
      return primaries === 12 ? 'p3' : 'srgb';
    }
    if (type === 'prof' || type === 'rICC') {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const size = view.getUint32(i - 4);
      const icc = bytes.subarray(i + 8, Math.min(bytes.length, i - 4 + size));
      const text = ascii(icc, 0, icc.length).replaceAll('\0', '');
      return /P3/.test(text) ? 'p3' : 'srgb';
    }
  }
  return 'srgb';
}
