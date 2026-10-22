const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;
const IHDR_END = 24;

export class PngError extends Error {}

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

export function readPngSize(bytes: Uint8Array): PngSize {
  if (bytes.length < IHDR_END || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new PngError('Not a PNG file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(IHDR_WIDTH_OFFSET), height: view.getUint32(IHDR_HEIGHT_OFFSET) };
}
