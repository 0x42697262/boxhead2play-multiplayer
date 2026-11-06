import { describe, expect, it } from 'vitest';
import { Angle } from '../../src/domain/math/Angle.ts';
import { Explosion } from '../../src/domain/things/effects/Explosion.ts';
import { createThingFactory } from '../../src/domain/things/factory.ts';
import { CompletionState } from '../../src/domain/world/CompletionState.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { GameSpeed, PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import { Team, TEAM_BATTLE_RULES } from '../../src/domain/world/TeamBattle.ts';
import { decodeServerMessage, encodeServerMessage, ErrorReason, LeaveReason, type ServerMessage } from '../../src/net/protocol.ts';
import { silentLogger } from '../../src/observability/logger.ts';
import { Lobby, type LobbyClient } from '../../src/server/Lobby.ts';
import type { Ticker } from '../../src/server/ports.ts';
import { MS_PER_SECOND } from '../../src/server/tuning.ts';
import { assetAnimationCatalog } from '../domain/support/animationCatalog.ts';
import { playerOf } from '../domain/support/realWorld.ts';
import { assetRoom } from '../domain/support/rooms.ts';
import { OPTIONS } from './support.ts';

const definition = assetRoom('ROOM_Single_0001');
const animations = assetAnimationCatalog();
const STARTED_MS = 1000;
const DEADLINE_MS = STARTED_MS + TEAM_BATTLE_RULES.regulationSeconds * MS_PER_SECOND;

class Client implements LobbyClient {
  connected = true;
  readonly latencyMs = undefined;
  readonly messages: ServerMessage[] = [];

  constructor(readonly id: string, readonly name = id) {}

  send(message: ServerMessage): void {
    const decoded = decodeServerMessage(encodeServerMessage(message));
    if (!decoded) throw new Error(`Invalid Team Battle message: ${message.type}`);
    this.messages.push(decoded);
  }

  over() {
    return this.messages.filter((message) => message.type === 'gameOver');
  }
}

class Ticks implements Ticker {
  callback: (() => void) | undefined;

  start(_rate: number, callback: () => void): () => void {
    this.callback = callback;
    return () => { this.callback = undefined; };
  }

  step(): void {
    this.callback?.();
  }
}

function fixture(speed: GameSpeed = GameSpeed.Normal, count = 4) {
  if (!definition || !animations) throw new Error('Extract the game assets before running Team Battle verification');
  let now = STARTED_MS;
  const clients = Array.from({ length: count }, (_unused, index) => new Client(`Player ${index + 1}`));
  const host = clients[0];
  if (!host) throw new Error('Missing host');
  const ticker = new Ticks();
  const lobby = new Lobby({ id: 'battle', code: 'ABCDE', mode: GameMode.TeamBattle, roomId: definition.id, options: { ...OPTIONS, gameSpeed: speed } }, host, PlayerCharacter.Bambo, {
    content: { rooms: new Map([[definition.id, definition]]), animations, factory: createThingFactory() },
    clock: { now: () => now }, ticker, logger: silentLogger, newId: () => 'match', newSeed: () => 7, onChanged: () => undefined, onEmpty: () => undefined,
  });
  for (const client of clients.slice(1)) expect(lobby.add(client, PlayerCharacter.Swat)).toBeUndefined();
  return { lobby, host, clients, ticker, time: (value: number) => { now = value; } };
}

function clientAt(clients: readonly Client[], index: number): Client {
  const client = clients[index];
  if (!client) throw new Error('Missing player');
  return client;
}

describe.skipIf(!definition || !animations)('approved Team Battle plan: authoritative lobby, validated messages and real server world', () => {
  it('balances four players, allows three versus one and rejects an empty opposing start', () => {
    const { lobby, host, clients } = fixture();
    expect(lobby.dto().members.map((member) => member.team)).toEqual([Team.A, Team.B, Team.A, Team.B]);
    expect(lobby.setTeam(clientAt(clients, 1), Team.A)).toBeUndefined();
    expect(lobby.dto().members.filter((member) => member.team === Team.A)).toHaveLength(3);
    expect(lobby.play(host)).toBeUndefined();
    const empty = fixture(GameSpeed.Normal, 2);
    empty.lobby.setTeam(clientAt(empty.clients, 1), Team.A);
    expect(empty.lobby.play(empty.host)).toBe(ErrorReason.TeamsRequired);
    expect(empty.lobby.activeMatch).toBeUndefined();
  });

  it('enforces eight per team and sixteen total without moving any existing player', () => {
    const { lobby, clients } = fixture(GameSpeed.Normal, TEAM_BATTLE_RULES.maximumPerTeam * 2);
    expect(lobby.setTeam(clientAt(clients, 1), Team.A)).toBe(ErrorReason.TeamFull);
    expect(lobby.add(new Client('Extra'), PlayerCharacter.Bond)).toBe(ErrorReason.LobbyFull);
    expect(lobby.dto().members.filter((member) => member.team === Team.A)).toHaveLength(TEAM_BATTLE_RULES.maximumPerTeam);
  });

  it('locks entered teams through voluntary leave, known-player rejoin, reconnect and host changes; late entrants may choose first', () => {
    const { lobby, host, clients } = fixture();
    expect(lobby.play(host)).toBeUndefined();
    const known = clientAt(clients, 2);
    expect(lobby.setTeam(known, Team.B)).toBe(ErrorReason.TeamLocked);
    lobby.leaveGame(known);
    expect(lobby.setTeam(known, Team.B)).toBe(ErrorReason.TeamLocked);
    lobby.remove(known, LeaveReason.Left);
    expect(lobby.add(known, PlayerCharacter.Bambo)).toBeUndefined();
    expect(lobby.dto().members.find((member) => member.id === known.id)?.team).toBe(Team.A);
    expect(lobby.play(known)).toBeUndefined();
    known.connected = false;
    lobby.connectionChanged(known);
    const index = lobby.dto().members.find((member) => member.id === known.id)?.playerIndex;
    known.connected = true;
    lobby.connectionChanged(known);
    expect(lobby.dto().members.find((member) => member.id === known.id)?.playerIndex).toBe(index);
    const late = new Client('Late');
    lobby.add(late, PlayerCharacter.Bond);
    expect(lobby.setTeam(late, Team.B)).toBeUndefined();
    expect(lobby.play(late)).toBeUndefined();
    expect(lobby.setTeam(late, Team.A)).toBe(ErrorReason.TeamLocked);
    lobby.remove(host, LeaveReason.Left);
    expect(lobby.dto().members.find((member) => member.host)?.team).toBe(Team.B);
    expect(lobby.setTeam(known, Team.B)).toBe(ErrorReason.TeamLocked);
  });

  it('defaults enemies off and allows only the host to configure the independent switches before play', () => {
    const { lobby, host, clients } = fixture();
    expect(lobby.dto().options).toMatchObject({ teamZombiesActive: false, teamDevilsActive: false });
    const options = { ...lobby.dto().options, teamZombiesActive: true, teamDevilsActive: true };
    expect(lobby.configure(clientAt(clients, 1), lobby.dto().roomId, options)).toBe(ErrorReason.NotHost);
    expect(lobby.configure(host, lobby.dto().roomId, options)).toBeUndefined();
    expect(lobby.play(host)).toBeUndefined();
    expect(lobby.configure(host, lobby.dto().roomId, { ...options, teamZombiesActive: false })).toBe(ErrorReason.AlreadyPlaying);
  });

  it.each(Object.values(GameSpeed))('ends in one shared draw after five real minutes at game speed %s, not five simulation minutes', (speed) => {
    const { lobby, host, clients, ticker, time } = fixture(speed);
    expect(lobby.play(host)).toBeUndefined();
    time(DEADLINE_MS - 1);
    ticker.step();
    expect(clients.every((client) => client.over().length === 0)).toBe(true);
    const frames = host.messages.filter((message) => message.type === 'frame');
    expect(frames.at(-1)?.hud.teamBattle?.remainingSeconds).toBe(1);
    time(DEADLINE_MS);
    ticker.step();
    for (const client of clients) {
      expect(client.over()).toHaveLength(1);
      expect(client.over()[0]?.teamResult).toEqual({ scores: { a: 0, b: 0 }, winner: null, abandoned: false });
    }
    expect(lobby.activeMatch).toBeUndefined();
    ticker.step();
    expect(host.over()).toHaveLength(1);
  });

  it('a real opponent kill wins at the deadline; a queued boundary attack cannot change the result afterward', () => {
    const { lobby, host, clients, ticker, time } = fixture();
    lobby.play(host);
    const match = lobby.activeMatch;
    if (!match) throw new Error('Missing match');
    const owner = playerOf(match.world);
    const enemy = playerOf(match.world, 1);
    enemy.invincible = 0;
    match.world.things.add(new Explosion(match.world, enemy.position.clone(), new Angle(0), owner, enemy.maxLife));
    for (let tick = 0; tick < match.ticksPerSecond * 2 && !enemy.deathLogged; tick++) ticker.step();
    expect(match.world.teamBattle?.scores).toEqual({ a: 1, b: 0 });
    expect(lobby.activeMatch).toBe(match);
    const victim = playerOf(match.world, 3);
    victim.invincible = 0;
    match.world.things.add(new Explosion(match.world, victim.position.clone(), new Angle(0), owner, victim.maxLife));
    time(DEADLINE_MS);
    ticker.step();
    for (const client of clients) expect(client.over()[0]?.teamResult).toEqual({ scores: { a: 1, b: 0 }, winner: Team.A, abandoned: false });
    match.world.logKill(victim);
    expect(match.world.teamBattle?.scores).toEqual({ a: 1, b: 0 });
  });

  it('keeps disconnected players through reconnect grace, then ends without a winner when a team leaves', () => {
    const { lobby, host, clients, ticker } = fixture(GameSpeed.Normal, 2);
    lobby.play(host);
    const other = clientAt(clients, 1);
    other.connected = false;
    lobby.connectionChanged(other);
    ticker.step();
    expect(lobby.activeMatch).toBeDefined();
    expect(host.over()).toHaveLength(0);
    lobby.remove(other, LeaveReason.Expired);
    expect(lobby.activeMatch).toBeUndefined();
    expect(host.over()[0]).toMatchObject({ state: CompletionState.TeamFinished, teamResult: { winner: null, abandoned: true } });
  });
});
