import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SHA256 = 'sha256';
const HEX = 'hex';
const UTF8 = 'utf8';

export async function makeWorkDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeDir(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, UTF8);
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, UTF8);
}

export async function copyInto(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
}

export async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
}

export async function listDirectories(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

export interface FileDigest {
  readonly bytes: number;
  readonly sha256: string;
}

export async function digestFile(filePath: string): Promise<FileDigest> {
  const [content, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  return { bytes: info.size, sha256: createHash(SHA256).update(content).digest(HEX) };
}

export async function readSvgDirectory(directory: string, extension: string): Promise<Map<number, string>> {
  const svgs = new Map<number, string>();
  for (const name of await listFiles(directory)) {
    if (!name.endsWith(extension)) continue;
    const id = Number(name.slice(0, -extension.length));
    if (Number.isInteger(id)) svgs.set(id, await readText(path.join(directory, name)));
  }
  return svgs;
}
