import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import { isCompressible, worthKeeping } from './precompressRules.ts';
import { BROTLI_QUALITY, DEFAULT_PRECOMPRESS_DIR, FAILURE_EXIT_CODE, GZIP_LEVEL, PARALLEL_COMPRESSIONS, PrecompressedSuffix } from './tuning.ts';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);
const BYTES_PER_MIB = 1024 * 1024;

async function mapLimited<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
    }),
  );
  return nested.flat();
}

async function writeIfWorth(target: string, raw: Buffer, compressed: Buffer): Promise<number> {
  if (!worthKeeping(raw.length, compressed.length)) {
    await rm(target, { force: true });
    return 0;
  }
  await writeFile(target, compressed);
  return compressed.length;
}

async function precompressFile(file: string): Promise<{ readonly raw: number; readonly brotli: number }> {
  const raw = await readFile(file);
  const [br, gz] = await Promise.all([
    brotli(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
    gzipAsync(raw, { level: GZIP_LEVEL }),
  ]);
  const brBytes = await writeIfWorth(`${file}${PrecompressedSuffix.Brotli}`, raw, br);
  await writeIfWorth(`${file}${PrecompressedSuffix.Gzip}`, raw, gz);
  return { raw: raw.length, brotli: brBytes === 0 ? raw.length : brBytes };
}

async function precompress(directory: string): Promise<void> {
  const files = await listFiles(directory);
  const sizes = await Promise.all(files.map(async (file) => ({ file, bytes: (await stat(file)).size })));
  const targets = sizes.filter(({ file, bytes }) => isCompressible(file.split(path.sep).join('/'), bytes)).map(({ file }) => file);
  const results = await mapLimited(targets, PARALLEL_COMPRESSIONS, precompressFile);
  const raw = results.reduce((total, result) => total + result.raw, 0);
  const compressed = results.reduce((total, result) => total + result.brotli, 0);
  console.log(`Precompressed ${results.length} files in ${directory}: ${(raw / BYTES_PER_MIB).toFixed(2)} MiB -> ${(compressed / BYTES_PER_MIB).toFixed(2)} MiB with brotli.`);
}

try {
  await precompress(path.resolve(process.argv[2] ?? DEFAULT_PRECOMPRESS_DIR));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = FAILURE_EXIT_CODE;
}
