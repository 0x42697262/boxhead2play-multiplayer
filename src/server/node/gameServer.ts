import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { Logger } from '../../observability/logger.ts';
import { Hub } from '../Hub.ts';
import type { GameContent } from '../ports.ts';
import { createMonitor, type Monitor, type MonitorAccess } from './monitor.ts';
import { attachSocketGateway, type SocketGatewayOptions } from './socketGateway.ts';
import { fixedStepTicker, nodeClock, nodeTimers } from './timing.ts';

const SEED_LIMIT = 2 ** 32;

export interface GameServer {
  readonly hub: Hub;
  readonly monitor: Monitor;
  close(): void;
}

export function attachGameServer(server: Server, content: GameContent, logger: Logger, access: MonitorAccess, gateway: SocketGatewayOptions): GameServer {
  const hub = new Hub({
    content,
    ticker: fixedStepTicker(nodeClock),
    timers: nodeTimers,
    clock: nodeClock,
    newId: () => randomUUID(),
    newSeed: () => randomInt(SEED_LIMIT),
    logger,
  });
  const sockets = attachSocketGateway(server, hub, gateway);
  const monitor = createMonitor({ hub, traffic: () => sockets.traffic() }, access);
  return {
    hub,
    monitor,
    close() {
      monitor.close();
      sockets.close();
      hub.close();
    },
  };
}
