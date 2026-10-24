import { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { ClientMessage, GameStarted, LobbyDto, NetFrame } from '../../../src/net/protocol.ts';
import type { Transport } from '../../../src/services/online/OnlineClient.ts';

export class FakeTransport implements Transport {
  readonly sent: ClientMessage[] = [];
  connects = 0;
  disconnects = 0;
  open = true;

  connect(): void {
    this.connects++;
  }

  disconnect(): void {
    this.disconnects++;
  }

  send(message: ClientMessage): boolean {
    if (!this.open) return false;
    this.sent.push(message);
    return true;
  }

  types(): string[] {
    return this.sent.map((message) => message.type);
  }
}

export const OPTIONS = { difficulty: 0, gameSpeed: 1, devilsActive: true, collisionsActive: true, damageActive: true, gameAmount: 1, detail: true } as const;

export const START: GameStarted = {
  type: 'gameStarted',
  matchId: 'm1',
  lobbyId: 'l1',
  mode: GameMode.Coop,
  roomId: 'ROOM_Single_0001',
  options: OPTIONS,
  playerIndex: 1,
  ticksPerSecond: 25,
  projectionFactor: -0.5,
};

export function lobby(overrides: Partial<LobbyDto> = {}): LobbyDto {
  return {
    id: 'l1',
    name: "Ann's game",
    mode: GameMode.Coop,
    roomId: 'ROOM_Single_0001',
    options: OPTIONS,
    state: 'waiting',
    maxPlayers: 4,
    members: [
      { id: 'c1', name: 'Ann', character: 3, host: true, connected: true, playerIndex: null },
      { id: 'c2', name: 'Bob', character: 0, host: false, connected: true, playerIndex: null },
    ],
    ...overrides,
  };
}

export function frame(tick: number, overrides: Partial<NetFrame> = {}): NetFrame {
  return {
    type: 'frame',
    tick,
    brightness: 0,
    camera: { playerIndex: 1, rect: { x: 32, y: 32, width: 640, height: 480 }, drawOrigin: { x: 32, y: 32 } },
    entries: [],
    hud: { totalScore: 0, multiplier: 1, multiplierTickRatio: 0, frags: [0, 0, 0, 0], deaths: [0, 0, 0, 0], messages: [], players: [] },
    events: [],
    ...overrides,
  };
}
