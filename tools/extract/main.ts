import { randomUUID } from 'node:crypto';
import { LogLevel } from '../../src/config/env.ts';
import { createLogger } from '../../src/observability/logger.ts';
import { LogEvent } from '../../src/text/logEvents.ts';
import { loadExtractConfig } from './config.ts';
import { runPipeline } from './pipeline.ts';
import { expectedStamp, resolveFfdecJar, writeStamp } from '../setup/environment.ts';
import { SetupMessage } from '../setup/messages.ts';

const FAILURE_EXIT_CODE = 1;

async function main(): Promise<void> {
  const logger = createLogger(LogLevel.Info, randomUUID());
  try {
    const repoRoot = process.cwd();
    const loaded = loadExtractConfig();
    const config = { ...loaded, ffdecJar: await resolveFfdecJar(loaded, repoRoot, () => console.log(SetupMessage.downloadingFfdec)) };
    logger.info(LogEvent.ExtractStarted, { swf: config.swfPath, outDir: config.outDir, ffdec: config.ffdecJar });
    const manifest = await runPipeline(config, logger);
    writeStamp(config.outDir, expectedStamp(repoRoot, config.swfPath));
    logger.info(LogEvent.ExtractFinished, {
      files: manifest.files.length,
      bytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
      sourceSha256: manifest.source.sha256,
    });
  } catch (error) {
    logger.error(LogEvent.ExtractFailed, { message: error instanceof Error ? error.message : String(error) });
    process.exitCode = FAILURE_EXIT_CODE;
  }
}

await main();
