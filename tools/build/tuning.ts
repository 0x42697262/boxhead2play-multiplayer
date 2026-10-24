export const COMPRESSIBLE_EXTENSIONS: ReadonlySet<string> = new Set(['.html', '.js', '.css', '.json', '.map', '.svg']);
export const MIN_COMPRESS_BYTES = 1024;
export const MAX_COMPRESSED_RATIO = 0.9;
export const BROTLI_QUALITY = 11;
export const GZIP_LEVEL = 9;
export const PARALLEL_COMPRESSIONS = 4;
export const DEFAULT_PRECOMPRESS_DIR = 'dist';
export const FAILURE_EXIT_CODE = 1;

export const PrecompressedSuffix = {
  Brotli: '.br',
  Gzip: '.gz',
} as const;
