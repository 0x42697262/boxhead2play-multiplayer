import { COMPRESSIBLE_EXTENSIONS, MAX_COMPRESSED_RATIO, MIN_COMPRESS_BYTES, PrecompressedSuffix } from './tuning.ts';

const PRECOMPRESSED_SUFFIXES: readonly string[] = Object.values(PrecompressedSuffix);

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

export function isCompressible(path: string, bytes: number): boolean {
  if (PRECOMPRESSED_SUFFIXES.some((suffix) => path.endsWith(suffix))) return false;
  return bytes >= MIN_COMPRESS_BYTES && COMPRESSIBLE_EXTENSIONS.has(extensionOf(path));
}

export function worthKeeping(rawBytes: number, compressedBytes: number): boolean {
  return compressedBytes <= rawBytes * MAX_COMPRESSED_RATIO;
}
