import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseExtractConfig } from '../extract/config.ts';
import { OutputPath } from '../extract/tuning.ts';
import { expectedStamp, readStamp, SetupError } from './environment.ts';
import { judgeFreshness } from './freshness.ts';
import { SetupMessage } from './messages.ts';
import { EXTRACTOR_ENTRY, FAILURE_EXIT_CODE } from './tuning.ts';

function ensureAssets(repoRoot: string): void {
  const config = parseExtractConfig(process.env, repoRoot);
  if (!existsSync(config.swfPath)) throw new SetupError(SetupMessage.swfMissing(config.swfPath));
  const verdict = judgeFreshness(
    { manifestExists: existsSync(path.join(config.outDir, OutputPath.Manifest)), stamp: readStamp(config.outDir) },
    expectedStamp(repoRoot, config.swfPath),
  );
  if (verdict.fresh) {
    console.log(SetupMessage.upToDate);
    return;
  }
  console.log(SetupMessage.extracting(verdict.reason));
  const result = spawnSync(process.execPath, [path.join(repoRoot, EXTRACTOR_ENTRY)], { cwd: repoRoot, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new SetupError(SetupMessage.extractFailed(result.status));
  console.log(SetupMessage.extracted);
}

try {
  ensureAssets(process.cwd());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = FAILURE_EXIT_CODE;
}
