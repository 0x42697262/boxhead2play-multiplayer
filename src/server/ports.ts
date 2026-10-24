import type { AnimationCatalog } from '../domain/animation/AnimationCatalog.ts';
import type { ThingFactory } from '../domain/things/ThingFactory.ts';
import type { RoomDefinition } from '../domain/world/RoomDefinition.ts';
import type { ServerMessage } from '../net/protocol.ts';
import type { Logger } from '../observability/logger.ts';
import type { Traffic } from './monitorProtocol.ts';

export interface Connection {
  send(message: ServerMessage): void;
  traffic(): Traffic;
  close(): void;
}

export type StopTicking = () => void;

export interface Ticker {
  start(ticksPerSecond: number, onTick: () => void): StopTicking;
}

export type CancelTimer = () => void;

export interface Timers {
  after(delayMs: number, callback: () => void): CancelTimer;
}

export interface Clock {
  now(): number;
}

export interface GameContent {
  readonly rooms: ReadonlyMap<string, RoomDefinition>;
  readonly animations: AnimationCatalog;
  readonly factory: ThingFactory;
}

export interface HubDependencies {
  readonly content: GameContent;
  readonly ticker: Ticker;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly newId: () => string;
  readonly newSeed: () => number;
  readonly logger: Logger;
}
