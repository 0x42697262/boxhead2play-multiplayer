import { randomInt, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { Logger } from '../../observability/logger.ts';
import { Hub } from '../Hub.ts';
import type { GameContent } from '../ports.ts';
import { attachSocketGateway } from './socketGateway.ts';
import { fixedStepTicker, nodeClock, nodeTimers } from './timing.ts';

const SEED_LIMIT = 2 ** 32;

export interface GameServer {
  readonly hub: Hub;
  close(): void;
}

export function attachGameServer(server: Server, content: GameContent, logger: Logger): GameServer {
  const hub = new Hub({
    content,
    ticker: fixedStepTicker(nodeClock),
    timers: nodeTimers,
    clock: nodeClock,
    newId: () => randomUUID(),
    newSeed: () => randomInt(SEED_LIMIT),
    logger,
  });
  const gateway = attachSocketGateway(server, hub);
  return {
    hub,
    close() {
      gateway.close();
      hub.close();
    },
  };
}
