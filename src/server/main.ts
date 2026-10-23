import { createServer } from 'node:http';
import { join } from 'node:path';
import { LogLevel } from '../config/env.ts';
import { loadServerSettings } from '../config/serverEnv.ts';
import { createLogger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import { loadGameContent } from './node/content.ts';
import { attachGameServer } from './node/gameServer.ts';
import { staticFileHandler } from './node/staticFiles.ts';

const SERVER_LOG_SESSION = 'server';
const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;
const FAILURE_EXIT_CODE = 1;

async function main(): Promise<void> {
  const settings = loadServerSettings(process.env);
  const logger = createLogger(settings.logLevel, SERVER_LOG_SESSION);
  const content = await loadGameContent(settings.assetDir);
  const server = createServer(staticFileHandler(settings.staticDir));
  const game = attachGameServer(server, content, logger);
  server.listen(settings.port, settings.host, () => {
    logger.info(LogEvent.ServerStarted, { host: settings.host, port: settings.port, rooms: content.rooms.size, assets: join(settings.assetDir) });
  });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      game.close();
      server.close();
    });
  }
}

main().catch((error: unknown) => {
  createLogger(LogLevel.Error, SERVER_LOG_SESSION).error(LogEvent.ServerFailed, { error: String(error) });
  process.exitCode = FAILURE_EXIT_CODE;
});
