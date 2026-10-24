import type { Server } from 'node:http';
import type { LogLevel } from '../config/env.ts';
import { NO_ADDRESS_LIMITS } from '../config/serverEnv.ts';
import { createLogger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import { loadGameContent } from './node/content.ts';
import { attachGameServer, type GameServer, type GameServerOptions } from './node/gameServer.ts';
export { versionedAssetMiddleware } from './node/versionedAssets.ts';

const DEV_LOG_SESSION = 'dev-server';
const DEV_OPTIONS: GameServerOptions = {
  monitor: { token: undefined, loopbackWithoutToken: true },
  gateway: { rejectForeignUpgrades: false, trustProxy: false },
  limits: NO_ADDRESS_LIMITS,
};

export async function attachDevGameServer(server: Server, assetDir: string, logLevel: LogLevel): Promise<GameServer | undefined> {
  const logger = createLogger(logLevel, DEV_LOG_SESSION);
  try {
    const content = await loadGameContent(assetDir);
    const game = attachGameServer(server, content, logger, DEV_OPTIONS);
    logger.info(LogEvent.ServerStarted, { session: DEV_LOG_SESSION, rooms: content.rooms.size });
    return game;
  } catch (error) {
    logger.error(LogEvent.ServerFailed, { error: String(error) });
    return undefined;
  }
}
