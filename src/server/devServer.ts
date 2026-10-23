import type { Server } from 'node:http';
import type { LogLevel } from '../config/env.ts';
import { createLogger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import { loadGameContent } from './node/content.ts';
import { attachGameServer, type GameServer } from './node/gameServer.ts';

const DEV_LOG_SESSION = 'dev-server';

export async function attachDevGameServer(server: Server, assetDir: string, logLevel: LogLevel): Promise<GameServer | undefined> {
  const logger = createLogger(logLevel, DEV_LOG_SESSION);
  try {
    const content = await loadGameContent(assetDir);
    const game = attachGameServer(server, content, logger);
    logger.info(LogEvent.ServerStarted, { session: DEV_LOG_SESSION, rooms: content.rooms.size });
    return game;
  } catch (error) {
    logger.error(LogEvent.ServerFailed, { error: String(error) });
    return undefined;
  }
}
