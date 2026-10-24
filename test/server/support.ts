import { NO_ADDRESS_LIMITS } from '../../src/config/serverEnv.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { createThingFactory } from '../../src/domain/things/factory.ts';
import { InitKind } from '../../src/domain/world/RoomDefinition.ts';
import { Difficulty, GameAmount, GameSpeed } from '../../src/domain/world/SimulationSettings.ts';
import { encodeClientMessage, parseServerMessage, PROTOCOL_VERSION, type ClientMessage, type LobbyOptions, type ServerMessage } from '../../src/net/protocol.ts';
import { WireDecoder, WireEncoder } from '../../src/net/wire.ts';
import { Hub, type Link } from '../../src/server/Hub.ts';
import type { Traffic } from '../../src/server/monitorProtocol.ts';
import type { Connection, GameContent, HubDependencies, Ticker, Timers } from '../../src/server/ports.ts';
import { syntheticAnimationCatalog } from '../domain/support/animationCatalog.ts';
import { cellObject, room } from '../domain/support/fakes.ts';

export const ROOM_ID = 'ROOM_TEST';
export const TEST_ADDRESS = '203.0.113.1';
const CLOCK_STEP_MS = 10;

export const OPTIONS: LobbyOptions = {
  difficulty: Difficulty.Beginner,
  gameSpeed: GameSpeed.Normal,
  devilsActive: false,
  collisionsActive: true,
  damageActive: true,
  gameAmount: GameAmount.Kills5,
  detail: true,
};

export function testContent(): GameContent {
  const definition = {
    ...room(24, 16, [cellObject(InitKind.Player1, 4, 4, 1), cellObject(InitKind.Player2, 10, 8, 2, 180), cellObject(InitKind.Zombie, 20, 12, 3)]),
    id: ROOM_ID,
  };
  return { rooms: new Map([[ROOM_ID, definition]]), animations: syntheticAnimationCatalog(), factory: createThingFactory() };
}

export class FakeTicker implements Ticker {
  private readonly callbacks = new Set<() => void>();
  rates: number[] = [];

  start(ticksPerSecond: number, onTick: () => void): () => void {
    this.rates.push(ticksPerSecond);
    this.callbacks.add(onTick);
    return () => this.callbacks.delete(onTick);
  }

  get running(): number {
    return this.callbacks.size;
  }

  tick(times = 1): void {
    for (let i = 0; i < times; i++) for (const callback of [...this.callbacks]) callback();
  }
}

export class FakeTimers implements Timers {
  private now = 0;
  private pending: { at: number; callback: () => void; cancelled: boolean }[] = [];

  after(delayMs: number, callback: () => void): () => void {
    const timer = { at: this.now + delayMs, callback, cancelled: false };
    this.pending.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }

  advance(ms: number): void {
    this.now += ms;
    const due = this.pending.filter((timer) => timer.at <= this.now && !timer.cancelled);
    this.pending = this.pending.filter((timer) => timer.at > this.now && !timer.cancelled);
    for (const timer of due) timer.callback();
  }
}

export class FakeConnection implements Connection {
  readonly received: ServerMessage[] = [];
  closed = false;
  link: Link | undefined;

  private readonly encoder = new WireEncoder();
  private readonly decoder = new WireDecoder();

  bytesSent = 0;
  bytesReceived = 0;

  traffic(): Traffic {
    return { bytesSent: this.bytesSent, bytesReceived: this.bytesReceived };
  }

  send(sent: ServerMessage): void {
    const bytes = this.encoder.encode(sent);
    this.bytesSent += bytes.length;
    const message = parseServerMessage(this.decoder.decode(bytes));
    if (!message) throw new Error(`undecodable server message: ${sent.type}`);
    this.received.push(message);
  }

  close(): void {
    this.closed = true;
  }

  say(message: ClientMessage): void {
    const text = encodeClientMessage(message);
    this.bytesReceived += text.length;
    this.link?.receive(text);
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.received.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type).at(-1);
  }

  all<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.received.filter((message): message is Extract<ServerMessage, { type: T }> => message.type === type);
  }
}

export interface TestHub {
  readonly hub: Hub;
  readonly ticker: FakeTicker;
  readonly timers: FakeTimers;
  connect(name: string, sessionId?: string | null, address?: string): FakeConnection;
  open(address?: string): FakeConnection;
}

export function testHub(overrides: Partial<HubDependencies> = {}): TestHub {
  const ticker = new FakeTicker();
  const timers = new FakeTimers();
  let ids = 0;
  let time = 0;
  const hub = new Hub({
    content: testContent(),
    ticker,
    timers,
    clock: { now: () => (time += CLOCK_STEP_MS) },
    newId: () => `id${++ids}`,
    newSeed: () => 7,
    logger: silentLogger,
    limits: NO_ADDRESS_LIMITS,
    ...overrides,
  });
  return {
    hub,
    ticker,
    timers,
    open(address = TEST_ADDRESS) {
      const connection = new FakeConnection();
      connection.link = hub.connect(connection, address);
      return connection;
    },
    connect(name, sessionId = null, address = TEST_ADDRESS) {
      const connection = this.open(address);
      connection.say({ type: 'hello', version: PROTOCOL_VERSION, sessionId, name });
      return connection;
    },
  };
}
