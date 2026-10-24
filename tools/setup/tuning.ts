export const FFDEC_VERSION = '26.4.0';
export const FFDEC_DOWNLOAD_URL = `https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version${FFDEC_VERSION}/ffdec_${FFDEC_VERSION}.zip`;
export const FFDEC_ARCHIVE_SHA256 = '56ce960aeafc7caf034e2052ba49f878a883f7c7ca690da6eeffca9587b5e4b9';
export const FFDEC_JAR_NAME = 'ffdec.jar';
export const FFDEC_CACHE_DIR = `.cache/ffdec/${FFDEC_VERSION}`;
export const FFDEC_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export const MIN_JAVA_MAJOR = 8;
export const JAVA_COMMAND = 'java';
export const JAVA_VERSION_ARGS = ['-version'] as const;

export const STAMP_FILE = 'extract-stamp.json';
export const STAMP_FORMAT_VERSION = 2;

export const EXTRACTOR_SOURCE_DIR = 'tools/extract';
export const EXTRACTOR_ENTRY = 'tools/extract/main.ts';
export const EXTRACTOR_SOURCE_EXTENSION = '.ts';
export const EXTRACTOR_EXCLUDED_SUFFIXES = ['.test.ts'] as const;
export const EXTRACTOR_EXCLUDED_DIRS = ['debug', 'testing'] as const;
export const EXTRACTOR_SHARED_SOURCES = ['src/adapters/assets/schemas.ts'] as const;

export const FAILURE_EXIT_CODE = 1;
