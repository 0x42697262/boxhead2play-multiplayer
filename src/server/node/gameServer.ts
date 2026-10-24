import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressLimits } from '../../config/serverEnv.ts';
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

export interface GameServerOptions {
  readonly monitor: MonitorAccess;
  readonly gateway: SocketGatewayOptions;
  readonly limits: AddressLimits;
}

export function attachGameServer(server: Server, content: GameContent, logger: Logger, options: GameServerOptions): GameServer {
  const hub = new Hub({
    content,
    ticker: fixedStepTicker(nodeClock),
    timers: nodeTimers,
    clock: nodeClock,
    newId: () => randomUUID(),
    newSeed: () => randomInt(SEED_LIMIT),
    logger,
    limits: options.limits,
  });
  const sockets = attachSocketGateway(server, hub, options.gateway);
  const monitor = createMonitor({ hub, traffic: () => sockets.traffic() }, options.monitor);
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
