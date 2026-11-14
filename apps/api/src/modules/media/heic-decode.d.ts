/** Minimal types for heic-decode@2 (the package ships none). */
declare module 'heic-decode' {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface HeifImageRef {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  interface HeicDecode {
    (input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
    all(input: { buffer: Uint8Array | ArrayBuffer }): Promise<HeifImageRef[] & { dispose(): void }>;
  }
  const decode: HeicDecode;
  export default decode;
}
