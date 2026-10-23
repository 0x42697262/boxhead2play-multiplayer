import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { isExtractorSource, parseJavaMajor, type ExtractStamp, type SourceFile } from './freshness.ts';
import { SetupMessage } from './messages.ts';
import {
  EXTRACTOR_EXCLUDED_DIRS,
  EXTRACTOR_EXCLUDED_SUFFIXES,
  EXTRACTOR_SOURCE_DIR,
  EXTRACTOR_SOURCE_EXTENSION,
  FFDEC_ARCHIVE_SHA256,
  FFDEC_CACHE_DIR,
  FFDEC_DOWNLOAD_TIMEOUT_MS,
  FFDEC_DOWNLOAD_URL,
  FFDEC_JAR_NAME,
  FFDEC_VERSION,
  JAVA_COMMAND,
  JAVA_VERSION_ARGS,
  MIN_JAVA_MAJOR,
  STAMP_FILE,
  STAMP_FORMAT_VERSION,
} from './tuning.ts';

export class SetupError extends Error {}

const POSIX_SEPARATOR = '/';
const STAGING_SUFFIX = '.partial';

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function fingerprintSources(files: readonly SourceFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path).update('\0').update(file.content).update('\0');
  }
  return hash.digest('hex');
}

function listFiles(directory: string, root: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(full, root);
    return [path.relative(root, full).split(path.sep).join(POSIX_SEPARATOR)];
  });
}

export function extractorFingerprint(repoRoot: string): string {
  const sourceRoot = path.join(repoRoot, EXTRACTOR_SOURCE_DIR);
  const files = listFiles(sourceRoot, sourceRoot)
    .filter((relative) => isExtractorSource(relative, EXTRACTOR_SOURCE_EXTENSION, EXTRACTOR_EXCLUDED_SUFFIXES, EXTRACTOR_EXCLUDED_DIRS))
    .map((relative) => ({ path: relative, content: readFileSync(path.join(sourceRoot, relative), 'utf8') }));
  return fingerprintSources(files);
}

export function expectedStamp(repoRoot: string, swfPath: string): ExtractStamp {
  return {
    formatVersion: STAMP_FORMAT_VERSION,
    swfSha256: sha256(readFileSync(swfPath)),
    extractorSha256: extractorFingerprint(repoRoot),
    ffdecVersion: FFDEC_VERSION,
  };
}

export function readStamp(outDir: string): unknown {
  const file = path.join(outDir, STAMP_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
}

export function writeStamp(outDir: string, stamp: ExtractStamp): void {
  writeFileSync(path.join(outDir, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
}

export function requireJava(): number {
  const result = spawnSync(JAVA_COMMAND, [...JAVA_VERSION_ARGS], { encoding: 'utf8' });
  if (result.error) throw new SetupError(SetupMessage.javaMissing(MIN_JAVA_MAJOR));
  const major = parseJavaMajor(`${result.stderr}\n${result.stdout}`);
  if (major === undefined || major < MIN_JAVA_MAJOR) throw new SetupError(SetupMessage.javaTooOld(MIN_JAVA_MAJOR, major));
  return major;
}

export function defaultFfdecJar(repoRoot: string): string {
  return path.join(repoRoot, FFDEC_CACHE_DIR, FFDEC_JAR_NAME);
}

export async function provisionFfdec(repoRoot: string): Promise<string> {
  const jar = defaultFfdecJar(repoRoot);
  if (existsSync(jar)) return jar;
  const response = await fetch(FFDEC_DOWNLOAD_URL, { signal: AbortSignal.timeout(FFDEC_DOWNLOAD_TIMEOUT_MS) }).catch((error: unknown) => {
    throw new SetupError(SetupMessage.ffdecDownloadFailed(FFDEC_DOWNLOAD_URL, String(error)));
  });
  if (!response.ok) throw new SetupError(SetupMessage.ffdecDownloadFailed(FFDEC_DOWNLOAD_URL, `HTTP ${response.status}`));
  const archive = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(archive);
  if (actual !== FFDEC_ARCHIVE_SHA256) throw new SetupError(SetupMessage.ffdecChecksumMismatch(FFDEC_ARCHIVE_SHA256, actual));
  const target = path.join(repoRoot, FFDEC_CACHE_DIR);
  const staging = `${target}${STAGING_SUFFIX}`;
  rmSync(staging, { recursive: true, force: true });
  for (const [name, content] of Object.entries(unzipSync(archive))) {
    if (name.endsWith(POSIX_SEPARATOR)) continue;
    const destination = path.join(staging, name);
    if (!destination.startsWith(staging + path.sep)) throw new SetupError(SetupMessage.ffdecArchiveUnsafe(name));
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  rmSync(target, { recursive: true, force: true });
  renameSync(staging, target);
  if (!existsSync(jar)) throw new SetupError(SetupMessage.ffdecJarMissing(jar));
  return jar;
}

export interface FfdecSource {
  readonly ffdecJar: string | undefined;
}

export async function resolveFfdecJar(config: FfdecSource, repoRoot: string, onDownload: () => void): Promise<string> {
  requireJava();
  if (config.ffdecJar !== undefined) return config.ffdecJar;
  if (!existsSync(defaultFfdecJar(repoRoot))) onDownload();
  return provisionFfdec(repoRoot);
}
