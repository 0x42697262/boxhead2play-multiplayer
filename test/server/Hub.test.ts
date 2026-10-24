import { describe, expect, it, vi } from 'vitest';
import { PlayerControl } from '../../src/domain/world/input.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { CompletionState } from '../../src/domain/world/CompletionState.ts';
import { controlBit } from '../../src/net/controlMask.ts';
import { ErrorReason, LeaveReason, LobbyState, PROTOCOL_VERSION } from '../../src/net/protocol.ts';
import { MAX_LOBBY_PLAYERS } from '../../src/net/tuning.ts';
import { Lobby } from '../../src/server/Lobby.ts';
import type { Ticker } from '../../src/server/ports.ts';
import { NO_ADDRESS_LIMITS, type AddressLimits } from '../../src/config/serverEnv.ts';
import {
  HELLO_TIMEOUT_MS,
  MAX_CLIENTS,
  MAX_LOBBIES,
  MAX_MESSAGE_BYTES,
  MAX_SOCKETS,
  MESSAGE_BURST,
  MESSAGE_RATE_PER_SECOND,
  MS_PER_SECOND,
  RECONNECT_GRACE_MS,
} from '../../src/server/tuning.ts';
import { OPTIONS, ROOM_ID, testHub, type FakeConnection, type TestHub } from './support.ts';

function lobbyOf(connection: FakeConnection) {
  const lobby = connection.last('lobby')?.lobby;
  if (!lobby) throw new Error('no lobby message');
  return lobby;
}

function hostAndGuest(setup: TestHub, mode: typeof GameMode.Coop | typeof GameMode.DeathMatch = GameMode.Coop): { host: FakeConnection; guest: FakeConnection; lobbyId: string } {
  const host = setup.connect('Ann');
  const guest = setup.connect('Bob');
  host.say({ type: 'createLobby', mode, roomId: ROOM_ID, options: OPTIONS, character: 3 });
  const lobbyId = lobbyOf(host).id;
  guest.say({ type: 'joinLobby', lobbyId, character: 1 });
  return { host, guest, lobbyId };
}

describe('Hub sessions', () => {
  it('welcomes a client and resumes the same session on a new connection', () => {
    const setup = testHub();
    const first = setup.connect('Ann');
    const welcome = first.last('welcome');
    expect(welcome?.resumed).toBe(false);
    first.link?.closed();
    const second = setup.connect('Ann', welcome?.sessionId);
    expect(second.last('welcome')).toEqual({ type: 'welcome', clientId: welcome?.clientId, sessionId: welcome?.sessionId, resumed: true });
    expect(setup.hub.clientCount).toBe(1);
  });

  it('echoes a ping as a pong with the same id', () => {
    const setup = testHub();
    const ann = setup.connect('Ann');
    ann.say({ type: 'ping', id: 7, latencyMs: null });
    expect(ann.last('pong')).toEqual({ type: 'pong', id: 7 });
  });

  it('rejects a protocol version mismatch and malformed messages', () => {
    const setup = testHub();
    const connection = setup.connect('Ann');
    connection.link?.receive('{"type":"nonsense"}');
    expect(connection.last('error')?.reason).toBe(ErrorReason.BadMessage);
    const outdated = setup.open();
    outdated.say({ type: 'hello', version: PROTOCOL_VERSION + 1, sessionId: null, name: 'Old' });
    expect(outdated.last('error')?.reason).toBe(ErrorReason.VersionMismatch);
    expect(outdated.closed).toBe(true);
  });

  it('turns away a new client with serverFull once the server has its maximum, but still resumes a known session', () => {
    const setup = testHub();
    const clients = Array.from({ length: MAX_CLIENTS }, (_unused, index) => setup.connect(`P${index}`));
    const late = setup.connect('Late');
    expect(late.last('error')?.reason).toBe(ErrorReason.ServerFull);
    expect(late.closed).toBe(true);
    const first = clients[0];
    const sessionId = first?.last('welcome')?.sessionId;
    first?.link?.closed();
    const back = setup.connect('P0', sessionId);
    expect(back.last('welcome')?.resumed).toBe(true);
  });

  it('gives every lobby its own 5 character code and joins by it, ignoring case and spaces', () => {
    const setup = testHub();
    const { host, lobbyId } = hostAndGuest(setup);
    const second = setup.connect('Cy');
    second.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    const code = lobbyOf(second).code;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(lobbyOf(host).code).not.toBe(code);
    const dee = setup.connect('Dee');
    dee.say({ type: 'joinByCode', code: ` ${code.toLowerCase()} `, character: 0 });
    expect(lobbyOf(dee).id).toBe(lobbyOf(second).id);
    expect(lobbyOf(dee).id).not.toBe(lobbyId);
    const eve = setup.connect('Eve');
    eve.say({ type: 'joinByCode', code: 'ZZZZZ', character: 0 });
    expect(eve.last('error')?.reason).toBe(ErrorReason.CodeNotFound);
  });

  it('numbers a name that another player already uses, ignoring case', () => {
    const setup = testHub();
    const { lobbyId } = hostAndGuest(setup);
    const names = ['ann', 'Ann', 'Bob'].map((name) => {
      const connection = setup.connect(name);
      connection.say({ type: 'joinLobby', lobbyId, character: 0 });
      return connection;
    });
    expect(lobbyOf(names[2] as FakeConnection).members.map((member) => member.name)).toEqual(['Ann', 'Bob', 'ann #2', 'Ann #3', 'Bob #2']);
    const long = setup.connect('Zed the very long name');
    const twin = setup.connect('Zed the very long name');
    long.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    twin.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    expect(lobbyOf(twin).members[0]?.name).toBe('Zed the very #2');
  });

  it('sanitizes names', () => {
    const setup = testHub();
    const host = setup.connect('  \u0007Zed the very long name  ');
    host.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    expect(lobbyOf(host).members[0]?.name).toBe('Zed the very lon');
    const blank = setup.connect('   ');
    blank.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    expect(lobbyOf(blank).members[0]?.name).toBe('Player');
  });
});

describe('Hub limits', () => {
  it('answers a burst of messages until the bucket is empty, then refills it over time', () => {
    let time = 0;
    const setup = testHub({ clock: { now: () => time } });
    const ann = setup.connect('Ann');
    for (let id = 1; id < MESSAGE_BURST; id++) ann.say({ type: 'ping', id, latencyMs: null });
    expect(ann.all('pong')).toHaveLength(MESSAGE_BURST - 1);
    expect(ann.all('error')).toEqual([]);
    ann.say({ type: 'ping', id: 0, latencyMs: null });
    expect(ann.last('error')?.reason).toBe(ErrorReason.RateLimited);
    time += MS_PER_SECOND;
    for (let id = 0; id < MESSAGE_RATE_PER_SECOND; id++) ann.say({ type: 'ping', id, latencyMs: null });
    expect(ann.all('pong')).toHaveLength(MESSAGE_BURST - 1 + MESSAGE_RATE_PER_SECOND);
    ann.say({ type: 'ping', id: 0, latencyMs: null });
    expect(ann.all('error')).toHaveLength(2);
  });

  it('rejects an oversized message without decoding it', () => {
    const setup = testHub();
    const ann = setup.connect('Ann');
    ann.link?.receive(' '.repeat(MAX_MESSAGE_BYTES + 1));
    expect(ann.last('error')?.reason).toBe(ErrorReason.RateLimited);
  });

  it('refuses a lobby beyond the lobby limit', () => {
    const setup = testHub();
    const hosts = Array.from({ length: MAX_LOBBIES }, (_unused, index) => setup.connect(`P${index}`));
    for (const host of hosts) host.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    expect(setup.hub.lobbyCount).toBe(MAX_LOBBIES);
    const first = hosts[0];
    first?.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    expect(first?.last('error')?.reason).toBe(ErrorReason.LobbyLimit);
    expect(setup.hub.lobbyCount).toBe(MAX_LOBBIES);
  });
});

describe('Hub lobbies', () => {
  it('lists lobbies to clients watching the same mode', () => {
    const setup = testHub();
    const watcher = setup.connect('Watcher');
    watcher.say({ type: 'watchLobbies', mode: GameMode.Coop });
    expect(watcher.last('lobbies')?.lobbies).toEqual([]);
    const { lobbyId } = hostAndGuest(setup);
    expect(watcher.last('lobbies')?.lobbies).toEqual([
      { id: lobbyId, name: "Ann's game", mode: GameMode.Coop, roomId: ROOM_ID, state: LobbyState.Waiting, players: 2, maxPlayers: MAX_LOBBY_PLAYERS },
    ]);
    const deathMatch = setup.connect('Other');
    deathMatch.say({ type: 'watchLobbies', mode: GameMode.DeathMatch });
    expect(deathMatch.last('lobbies')?.lobbies).toEqual([]);
  });

  it('builds the lobby list once per change and sends it only when a listed field changed', () => {
    const setup = testHub();
    const watchers = ['W1', 'W2', 'W3'].map((name) => setup.connect(name));
    for (const watcher of watchers) watcher.say({ type: 'watchLobbies', mode: GameMode.Coop });
    const { host, guest } = hostAndGuest(setup);
    const lists = (): number[] => watchers.map((watcher) => watcher.all('lobbies').length);
    const listed = lists();
    const lobbyUpdates = guest.all('lobby').length;
    host.say({ type: 'setCharacter', character: 2 });
    host.say({ type: 'setName', name: 'Ann' });
    host.say({ type: 'configureLobby', roomId: ROOM_ID, options: OPTIONS });
    expect(lists()).toEqual(listed);
    expect(guest.all('lobby')).toHaveLength(lobbyUpdates + 1);
    const summaries = vi.spyOn(Lobby.prototype, 'summary');
    host.say({ type: 'setName', name: 'Zed' });
    expect(summaries).toHaveBeenCalledTimes(1);
    summaries.mockRestore();
    expect(lists()).toEqual(listed.map((count) => count + 1));
    expect(watchers.map((watcher) => watcher.last('lobbies')?.lobbies[0]?.name)).toEqual(["Zed's game", "Zed's game", "Zed's game"]);
    expect(guest.all('lobby')).toHaveLength(lobbyUpdates + 2);
  });

  it('only lets the host configure and start, and rejects unknown rooms', () => {
    const setup = testHub();
    const { host, guest } = hostAndGuest(setup);
    guest.say({ type: 'startGame' });
    expect(guest.last('error')?.reason).toBe(ErrorReason.NotHost);
    guest.say({ type: 'configureLobby', roomId: ROOM_ID, options: OPTIONS });
    expect(guest.last('error')?.reason).toBe(ErrorReason.NotHost);
    host.say({ type: 'configureLobby', roomId: 'ROOM_NOPE', options: OPTIONS });
    expect(host.last('error')?.reason).toBe(ErrorReason.RoomUnknown);
    host.say({ type: 'configureLobby', roomId: ROOM_ID, options: { ...OPTIONS, difficulty: 2 } });
    expect(lobbyOf(guest).options.difficulty).toBe(2);
  });

  it('refuses a seventeenth player', () => {
    const setup = testHub();
    const { lobbyId } = hostAndGuest(setup);
    for (let index = 2; index < MAX_LOBBY_PLAYERS; index++) setup.connect(`P${index}`).say({ type: 'joinLobby', lobbyId, character: 0 });
    const extra = setup.connect('Extra');
    extra.say({ type: 'joinLobby', lobbyId, character: 0 });
    expect(MAX_LOBBY_PLAYERS).toBe(16);
    expect(extra.last('error')?.reason).toBe(ErrorReason.LobbyFull);
  });

  it('keeps a member in its lobby when the lobby it tries to join is full', () => {
    const setup = testHub();
    const { lobbyId } = hostAndGuest(setup);
    for (let index = 2; index < MAX_LOBBY_PLAYERS; index++) setup.connect(`P${index}`).say({ type: 'joinLobby', lobbyId, character: 0 });
    const other = setup.connect('Other');
    other.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    const ownId = lobbyOf(other).id;
    other.say({ type: 'joinLobby', lobbyId, character: 0 });
    expect(other.last('error')?.reason).toBe(ErrorReason.LobbyFull);
    expect(other.last('lobbyLeft')).toBeUndefined();
    expect(setup.hub.lobby(ownId)?.size).toBe(1);
    other.say({ type: 'startGame' });
    expect(other.last('gameStarted')?.lobbyId).toBe(ownId);
  });

  it('moves the host role to the next member and closes an empty lobby', () => {
    const setup = testHub();
    const { host, guest } = hostAndGuest(setup);
    host.say({ type: 'leaveLobby' });
    expect(host.last('lobbyLeft')?.reason).toBe(LeaveReason.Left);
    expect(lobbyOf(guest).members).toEqual([expect.objectContaining({ name: 'Bob', host: true })]);
    guest.say({ type: 'leaveLobby' });
    expect(setup.hub.lobbyCount).toBe(0);
  });
});

describe('Hub matches', () => {
  it('starts every member at its own player index and streams per-player frames', () => {
    const setup = testHub();
    const { host, guest } = hostAndGuest(setup);
    host.say({ type: 'startGame' });
    expect(host.last('gameStarted')).toMatchObject({ mode: GameMode.Coop, roomId: ROOM_ID, playerIndex: 0, ticksPerSecond: 25 });
    expect(guest.last('gameStarted')?.playerIndex).toBe(1);
    expect(guest.last('upgrades')?.upgrades.length).toBeGreaterThan(0);
    expect(setup.ticker.rates).toEqual([25]);
    setup.ticker.tick(2);
    expect(host.last('frame')?.camera.playerIndex).toBe(0);
    expect(guest.last('frame')?.camera.playerIndex).toBe(1);
    expect(Math.max(...host.all('frame').map((frame) => frame.entries.length))).toBeGreaterThan(0);
    expect(host.last('frame')?.hud.players.map((player) => player.playerIndex).sort()).toEqual([0, 1]);
    expect(lobbyOf(host).state).toBe(LobbyState.Playing);
  });

  it('sends every player the reported latencies once per second', () => {
    const setup = testHub();
    const { host, guest } = hostAndGuest(setup);
    host.say({ type: 'ping', id: 1, latencyMs: 42 });
    guest.say({ type: 'ping', id: 1, latencyMs: 120 });
    host.say({ type: 'startGame' });
    setup.ticker.tick(50);
    expect(guest.all('latencies')).toHaveLength(2);
    expect(host.last('latencies')?.latencies).toEqual([
      { playerIndex: 0, latencyMs: 42 },
      { playerIndex: 1, latencyMs: 120 },
    ]);
    guest.link?.closed();
    setup.ticker.tick(25);
    expect(host.last('latencies')?.latencies).toEqual([
      { playerIndex: 0, latencyMs: 42 },
      { playerIndex: 1, latencyMs: null },
    ]);
  });

  it('runs a death match with sixteen players, each at its own index', () => {
    const setup = testHub();
    const { host, guest, lobbyId } = hostAndGuest(setup, GameMode.DeathMatch);
    const others = Array.from({ length: MAX_LOBBY_PLAYERS - 2 }, (_unused, index) => setup.connect(`P${index}`));
    for (const other of others) other.say({ type: 'joinLobby', lobbyId, character: 0 });
    host.say({ type: 'startGame' });
    const indices = [host, guest, ...others].map((connection) => connection.last('gameStarted')?.playerIndex);
    expect(new Set(indices).size).toBe(MAX_LOBBY_PLAYERS);
    setup.ticker.tick(2);
    expect(host.last('frame')?.hud.players).toHaveLength(MAX_LOBBY_PLAYERS);
  });

  it('applies held controls from input messages', () => {
    const setup = testHub();
    const { host, lobbyId } = hostAndGuest(setup);
    host.say({ type: 'startGame' });
    const player = setup.hub.lobby(lobbyId)?.activeMatch?.world.things.playerByIndex(0);
    const startX = player?.position.x ?? 0;
    const right = controlBit(PlayerControl.Right);
    host.say({ type: 'input', down: right, pressed: right, released: 0 });
    setup.ticker.tick(10);
    expect((player?.position.x ?? 0) - startX).toBeCloseTo(10 * 0.16);
  });

  it('lets a late member join a running match and a leaving one drop out', () => {
    const setup = testHub();
    const { host, guest, lobbyId } = hostAndGuest(setup);
    host.say({ type: 'startGame' });
    const late = setup.connect('Cat');
    late.say({ type: 'joinLobby', lobbyId, character: 2 });
    late.say({ type: 'startGame' });
    expect(late.last('gameStarted')?.playerIndex).toBe(2);
    const world = setup.hub.lobby(lobbyId)?.activeMatch?.world;
    expect(world?.things.players()).toHaveLength(3);
    guest.say({ type: 'leaveGame' });
    setup.ticker.tick();
    expect(world?.things.players()).toHaveLength(2);
    expect(lobbyOf(host).members.find((member) => member.name === 'Bob')?.playerIndex).toBeNull();
  });

  it('reports game over to the players and returns the lobby to waiting', () => {
    const setup = testHub();
    const { host, guest, lobbyId } = hostAndGuest(setup, GameMode.DeathMatch);
    host.say({ type: 'startGame' });
    const match = setup.hub.lobby(lobbyId)?.activeMatch;
    match?.world.complete(CompletionState.Quit);
    setup.ticker.tick();
    expect(host.last('gameOver')).toMatchObject({ state: CompletionState.Quit, winnerName: null });
    expect(guest.last('gameOver')?.matchId).toBe(match?.setup.id);
    expect(lobbyOf(host).state).toBe(LobbyState.Waiting);
    expect(setup.ticker.running).toBe(0);
  });

  it('ignores ticks that arrive after its match ended', () => {
    const ticks: (() => void)[] = [];
    const ticker: Ticker = {
      start(_rate, onTick) {
        ticks.push(onTick);
        return () => undefined;
      },
    };
    const setup = testHub({ ticker });
    const { host, lobbyId } = hostAndGuest(setup, GameMode.DeathMatch);
    host.say({ type: 'startGame' });
    setup.hub.lobby(lobbyId)?.activeMatch?.world.complete(CompletionState.Quit);
    const lateTick = ticks[0];
    lateTick?.();
    const sent = host.received.length;
    host.say({ type: 'startGame' });
    const restarted = host.received.length;
    lateTick?.();
    lateTick?.();
    expect(host.all('gameOver')).toHaveLength(1);
    expect(restarted).toBeGreaterThan(sent);
    expect(host.received.length).toBe(restarted);
  });

  it('holds a disconnected player for the grace period, then removes it', () => {
    const setup = testHub();
    const { host, guest, lobbyId } = hostAndGuest(setup);
    host.say({ type: 'startGame' });
    const welcome = guest.last('welcome');
    guest.link?.closed();
    expect(lobbyOf(host).members.find((member) => member.name === 'Bob')?.connected).toBe(false);
    setup.timers.advance(RECONNECT_GRACE_MS / 2);
    const back = setup.connect('Bob', welcome?.sessionId);
    expect(back.last('gameStarted')?.playerIndex).toBe(1);
    back.link?.closed();
    setup.timers.advance(RECONNECT_GRACE_MS);
    expect(lobbyOf(host).members.map((member) => member.name)).toEqual(['Ann']);
    expect(setup.hub.lobby(lobbyId)?.activeMatch?.world.things.players()).toHaveLength(1);
  });

  it('ends the match when every player has left it', () => {
    const setup = testHub();
    const { host, guest } = hostAndGuest(setup);
    host.say({ type: 'startGame' });
    host.say({ type: 'leaveGame' });
    guest.say({ type: 'leaveGame' });
    expect(lobbyOf(host).state).toBe(LobbyState.Waiting);
    expect(setup.ticker.running).toBe(0);
  });
});

const OTHER_ADDRESS = '198.51.100.7';

function limited(limits: Partial<AddressLimits>): TestHub {
  return testHub({ limits: { ...NO_ADDRESS_LIMITS, ...limits } });
}

function createLobby(connection: FakeConnection): void {
  connection.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
}

describe('Hub address limits', () => {
  it('refuses a socket over the per-address socket cap with addressLimit and counts it again after a close', () => {
    const setup = limited({ socketsPerAddress: 2 });
    const open = [setup.open(), setup.open()];
    const third = setup.open();
    expect(third.last('error')?.reason).toBe(ErrorReason.AddressLimit);
    expect(third.closed).toBe(true);
    expect(setup.hub.socketCount).toBe(2);
    expect(setup.open(OTHER_ADDRESS).closed).toBe(false);
    open[0]?.link?.closed();
    open[0]?.link?.closed();
    expect(setup.open().closed).toBe(false);
    expect(setup.hub.socketCount).toBe(3);
  });

  it('refuses every socket over the global socket cap with serverFull, hello or not', () => {
    const setup = testHub();
    for (let index = 0; index < MAX_SOCKETS; index++) setup.open(`10.0.${Math.trunc(index / 256)}.${index % 256}`);
    const late = setup.open(OTHER_ADDRESS);
    expect(late.last('error')?.reason).toBe(ErrorReason.ServerFull);
    expect(late.closed).toBe(true);
  });

  it('refuses a new session over the per-address cap, counts sessions in reconnect grace, and still resumes its own', () => {
    const setup = limited({ sessionsPerAddress: 2 });
    const ann = setup.connect('Ann');
    setup.connect('Bob');
    const sessionId = ann.last('welcome')?.sessionId;
    ann.link?.closed();
    const cy = setup.connect('Cy');
    expect(cy.last('error')?.reason).toBe(ErrorReason.AddressLimit);
    expect(cy.closed).toBe(true);
    expect(setup.connect('Dee', null, OTHER_ADDRESS).last('welcome')?.resumed).toBe(false);
    expect(setup.connect('Ann', sessionId).last('welcome')?.resumed).toBe(true);
    expect(setup.hub.clientCount).toBe(3);
  });

  it('frees a session slot when the reconnect grace ends', () => {
    const setup = limited({ sessionsPerAddress: 1 });
    setup.connect('Ann').link?.closed();
    expect(setup.connect('Bob').last('error')?.reason).toBe(ErrorReason.AddressLimit);
    setup.timers.advance(RECONNECT_GRACE_MS);
    expect(setup.connect('Bob').last('welcome')?.resumed).toBe(false);
  });

  it('refuses a lobby over the per-address lobby cap until one of them closes', () => {
    const setup = limited({ lobbiesPerAddress: 1 });
    const ann = setup.connect('Ann');
    createLobby(ann);
    const bob = setup.connect('Bob');
    createLobby(bob);
    expect(bob.last('error')?.reason).toBe(ErrorReason.AddressLobbyLimit);
    const cy = setup.connect('Cy', null, OTHER_ADDRESS);
    createLobby(cy);
    expect(cy.last('lobby')).toBeDefined();
    ann.say({ type: 'leaveLobby' });
    createLobby(bob);
    expect(bob.last('lobby')).toBeDefined();
    expect(setup.hub.lobbyCount).toBe(2);
  });

  it('keeps no limits with zero values', () => {
    const setup = testHub();
    const many = 20;
    const clients = Array.from({ length: many }, (_unused, index) => setup.connect(`P${index}`));
    for (const client of clients) createLobby(client);
    expect(setup.hub.lobbyCount).toBe(many);
  });
});

describe('Hub hello timeout', () => {
  it('closes a socket that sends no hello in time and frees its slot', () => {
    const setup = limited({ socketsPerAddress: 1 });
    const silent = setup.open();
    setup.timers.advance(HELLO_TIMEOUT_MS - 1);
    expect(silent.closed).toBe(false);
    setup.timers.advance(1);
    expect(silent.closed).toBe(true);
    silent.link?.closed();
    expect(setup.hub.socketCount).toBe(0);
  });

  it('keeps a socket that said hello and one that closed early alone', () => {
    const setup = testHub();
    const ann = setup.connect('Ann');
    const gone = setup.open();
    gone.link?.closed();
    setup.timers.advance(HELLO_TIMEOUT_MS);
    expect(ann.closed).toBe(false);
    expect(gone.closed).toBe(false);
  });
});
