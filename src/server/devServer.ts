import type { Server } from 'node:http';
import type { LogLevel } from '../config/env.ts';
import { createLogger } from '../observability/logger.ts';
import { LogEvent } from '../text/logEvents.ts';
import { loadGameContent } from './node/content.ts';
import { attachGameServer, type GameServer } from './node/gameServer.ts';
import type { MonitorAccess } from './node/monitor.ts';
import type { SocketGatewayOptions } from './node/socketGateway.ts';
export { versionedAssetMiddleware } from './node/versionedAssets.ts';

const DEV_LOG_SESSION = 'dev-server';
const DEV_MONITOR_ACCESS: MonitorAccess = { token: undefined, loopbackWithoutToken: true };
const DEV_GATEWAY: SocketGatewayOptions = { rejectForeignUpgrades: false };

export async function attachDevGameServer(server: Server, assetDir: string, logLevel: LogLevel): Promise<GameServer | undefined> {
  const logger = createLogger(logLevel, DEV_LOG_SESSION);
  try {
    const content = await loadGameContent(assetDir);
    const game = attachGameServer(server, content, logger, DEV_MONITOR_ACCESS, DEV_GATEWAY);
    logger.info(LogEvent.ServerStarted, { session: DEV_LOG_SESSION, rooms: content.rooms.size });
    return game;
  } catch (error) {
    logger.error(LogEvent.ServerFailed, { error: String(error) });
    return undefined;
  }
}
