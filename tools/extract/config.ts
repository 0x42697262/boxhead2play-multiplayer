import { statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DEFAULT_ASSET_OUT_DIR, DEFAULT_FFDEC_JAR, DEFAULT_SWF_PATH } from './tuning.ts';

export interface ExtractConfig {
  readonly swfPath: string;
  readonly ffdecJar: string;
  readonly outDir: string;
}

export class ExtractConfigError extends Error {}

const pathSetting = (fallback: string) => z.string().trim().min(1).default(fallback);

const envSchema = z.object({
  SWF_PATH: pathSetting(DEFAULT_SWF_PATH),
  FFDEC_JAR: pathSetting(DEFAULT_FFDEC_JAR),
  ASSET_OUT_DIR: pathSetting(DEFAULT_ASSET_OUT_DIR),
});

export function parseExtractConfig(env: Readonly<Record<string, string | undefined>>, cwd: string): ExtractConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new ExtractConfigError(z.prettifyError(parsed.error));
  return Object.freeze({
    swfPath: path.resolve(cwd, parsed.data.SWF_PATH),
    ffdecJar: path.resolve(cwd, parsed.data.FFDEC_JAR),
    outDir: path.resolve(cwd, parsed.data.ASSET_OUT_DIR),
  });
}

function requireFile(filePath: string, variable: string): void {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats?.isFile() !== true) {
    throw new ExtractConfigError(`${variable} points to ${filePath}, which is not a readable file`);
  }
}

export function loadExtractConfig(): ExtractConfig {
  const config = parseExtractConfig(process.env, process.cwd());
  requireFile(config.swfPath, 'SWF_PATH');
  requireFile(config.ffdecJar, 'FFDEC_JAR');
  return config;
}
