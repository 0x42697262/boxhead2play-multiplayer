import { z } from 'zod';
import { STAMP_FORMAT_VERSION } from './tuning.ts';

export const ExtractStampSchema = z.object({
  formatVersion: z.literal(STAMP_FORMAT_VERSION),
  swfSha256: z.string(),
  extractorSha256: z.string(),
  assetFormatVersion: z.number(),
  ffdecVersion: z.string(),
  ffdecJarSha256: z.string().nullable(),
});

export type ExtractStamp = z.infer<typeof ExtractStampSchema>;

export const StaleReason = {
  NoAssets: 'no-assets',
  NoStamp: 'no-stamp',
  SwfChanged: 'swf-changed',
  ExtractorChanged: 'extractor-changed',
  AssetFormatChanged: 'asset-format-changed',
  FfdecChanged: 'ffdec-changed',
} as const;

export type StaleReason = (typeof StaleReason)[keyof typeof StaleReason];

export interface AssetState {
  readonly manifestExists: boolean;
  readonly stamp: unknown;
}

export type Freshness = { readonly fresh: true } | { readonly fresh: false; readonly reason: StaleReason };

export function judgeFreshness(state: AssetState, expected: ExtractStamp): Freshness {
  if (!state.manifestExists) return { fresh: false, reason: StaleReason.NoAssets };
  const stamp = ExtractStampSchema.safeParse(state.stamp);
  if (!stamp.success) return { fresh: false, reason: StaleReason.NoStamp };
  if (stamp.data.swfSha256 !== expected.swfSha256) return { fresh: false, reason: StaleReason.SwfChanged };
  if (stamp.data.extractorSha256 !== expected.extractorSha256) return { fresh: false, reason: StaleReason.ExtractorChanged };
  if (stamp.data.assetFormatVersion !== expected.assetFormatVersion) return { fresh: false, reason: StaleReason.AssetFormatChanged };
  if (stamp.data.ffdecVersion !== expected.ffdecVersion) return { fresh: false, reason: StaleReason.FfdecChanged };
  if (stamp.data.ffdecJarSha256 !== expected.ffdecJarSha256) return { fresh: false, reason: StaleReason.FfdecChanged };
  return { fresh: true };
}

export interface SourceFile {
  readonly path: string;
  readonly content: string;
}

export function isExtractorSource(relativePath: string, extension: string, excludedSuffixes: readonly string[], excludedDirs: readonly string[]): boolean {
  const segments = relativePath.split('/');
  if (segments.some((segment) => excludedDirs.includes(segment))) return false;
  if (excludedSuffixes.some((suffix) => relativePath.endsWith(suffix))) return false;
  return relativePath.endsWith(extension);
}

export function parseJavaMajor(versionOutput: string): number | undefined {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(versionOutput);
  if (!match) return undefined;
  const first = Number(match[1]);
  const legacyPrefix = 1;
  return first === legacyPrefix && match[2] !== undefined ? Number(match[2]) : first;
}
