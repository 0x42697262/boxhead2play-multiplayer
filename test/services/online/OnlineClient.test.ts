import { PROTOCOL_VERSION } from '../../../src/net/tuning.ts';
import { describe, expect, it } from 'vitest';
import { MemorySessionToken } from '../../../src/adapters/net/TabSession.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import { parseServerMessage, type GameStarted, type ServerMessage } from '../../../src/net/protocol.ts';
import { ServerWireDecoder, ServerWireEncoder } from '../../../src/net/serverWire.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import { OnlineClient, OnlineStatus, type GameSink } from '../../../src/services/online/OnlineClient.ts';
import { FakeTransport, frame, lobby, OPTIONS, START } from './support.ts';

function client(session = new MemorySessionToken()) {
  const starts: GameStarted[] = [];
  const transport = new FakeTransport();
  const clock = { nowMs: 0 };
  const online = new OnlineClient({ session, name: () => 'Ann', logger: silentLogger, onGameStarted: (start) => starts.push(start), now: () => clock.nowMs });
  online.bind(transport);
  return { online, transport, starts, session, clock };
}

describe('OnlineClient name', () => {
  it('sends a changed name once, also from inside a lobby, and nothing while it is unchanged', () => {
    let name = 'Ann';
    const transport = new FakeTransport();
    const online = new OnlineClient({ session: new MemorySessionToken(), name: () => name, logger: silentLogger, onGameStarted: () => undefined, now: () => 0 });
    online.bind(transport);
    online.start();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    online.syncName();
    expect(transport.types().filter((type) => type === 'setName')).toHaveLength(0);
    name = 'Sam';
    online.syncName();
    online.syncName();
    expect(transport.sent.filter((message) => message.type === 'setName')).toEqual([{ type: 'setName', name: 'Sam' }]);
  });
});

describe('OnlineClient latency', () => {
  it('pings only while welcomed and turns the echoed pong into a round-trip time', () => {
    const { online, transport, clock } = client();
    online.start();
    online.ping();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    clock.nowMs = 1000.123456;
    online.ping();
    const ping = transport.sent.at(-1);
    expect(ping).toEqual({ type: 'ping', id: 0, latencyMs: null });
    expect(online.latencyMs()).toBeUndefined();
    clock.nowMs = 1042.123456;
    online.receive({ type: 'pong', id: 0 });
    expect(online.latencyMs()).toBe(42);
    expect(transport.types().filter((type) => type === 'ping')).toHaveLength(1);
  });

  it('matches a pong that went through the binary wire codec, with a fractional clock', () => {
    const { online, transport, clock } = client();
    const encoder = new ServerWireEncoder();
    const decoder = new ServerWireDecoder();
    const wire = (message: ServerMessage): ServerMessage | undefined => parseServerMessage(decoder.decode(encoder.encode(message)));
    online.start();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    clock.nowMs = 12345.678901;
    online.ping();
    const ping = transport.sent.at(-1);
    const pong = ping?.type === 'ping' ? wire({ type: 'pong', id: ping.id }) : undefined;
    clock.nowMs = 12363.678901;
    if (pong) online.receive(pong);
    expect(online.latencyMs()).toBe(18);
  });

  it('forgets the latency when the connection closes', () => {
    const { online, clock } = client();
    online.start();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    online.ping();
    clock.nowMs = 30;
    online.receive({ type: 'pong', id: 0 });
    online.closed();
    expect(online.latencyMs()).toBeUndefined();
  });
});

describe('OnlineClient connection', () => {
  it('says hello with the stored session, queues requests until welcome and stores the new session id', () => {
    const session = new MemorySessionToken('old');
    const { online, transport } = client(session);
    online.start();
    expect(online.state.status).toBe(OnlineStatus.Connecting);
    online.watch(GameMode.Coop);
    online.createLobby(GameMode.Coop, 'ROOM_Single_0001', OPTIONS, 3);
    online.opened();
    expect(transport.sent).toEqual([{ type: 'hello', version: PROTOCOL_VERSION, sessionId: 'old', name: 'Ann' }]);
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 'new', resumed: false });
    expect(transport.types()).toEqual(['hello', 'watchLobbies', 'createLobby']);
    expect(session.read()).toBe('new');
    expect(online.state).toMatchObject({ status: OnlineStatus.Online, clientId: 'c1' });
  });

  it('re-watches the lobby list after a reconnect and drops input while not welcomed', () => {
    const { online, transport } = client();
    online.start();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    online.watch(GameMode.DeathMatch);
    online.closed();
    expect(online.state.status).toBe(OnlineStatus.Connecting);
    expect(online.input({ down: 1, pressed: 1, released: 0 })).toBe(false);
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: true });
    expect(transport.sent.at(-1)).toEqual({ type: 'watchLobbies', mode: GameMode.DeathMatch });
  });

  it('stops reconnecting after a version mismatch and keeps the notice', () => {
    const { online, transport } = client();
    online.start();
    online.opened();
    online.watch(GameMode.Coop);
    online.receive({ type: 'error', reason: 'versionMismatch' });
    expect(transport.disconnects).toBe(1);
    expect(online.state).toMatchObject({ status: OnlineStatus.Offline, error: 'versionMismatch' });
    online.closed();
    expect(online.state.status).toBe(OnlineStatus.Offline);
  });

  it('keeps reconnecting while the network has too many tabs open and clears that notice after a welcome', () => {
    const { online, transport } = client();
    online.start();
    online.opened();
    online.receive({ type: 'error', reason: 'addressLimit' });
    online.closed();
    expect(transport.disconnects).toBe(0);
    expect(online.state).toMatchObject({ status: OnlineStatus.Connecting, error: 'addressLimit' });
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    expect(online.state.error).toBeUndefined();
  });

  it('keeps reconnecting while the server is full and clears that notice after a welcome', () => {
    const { online, transport } = client();
    online.start();
    online.opened();
    online.receive({ type: 'error', reason: 'serverFull' });
    online.closed();
    expect(transport.disconnects).toBe(0);
    expect(online.state).toMatchObject({ status: OnlineStatus.Connecting, error: 'serverFull' });
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    expect(online.state).toMatchObject({ status: OnlineStatus.Online, error: undefined });
  });

  it('leaves the lobby and disconnects on stop', () => {
    const { online, transport } = client();
    online.start();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    online.stop();
    expect(transport.sent.at(-1)).toEqual({ type: 'leaveLobby' });
    expect(transport.disconnects).toBe(1);
    expect(online.state.status).toBe(OnlineStatus.Offline);
  });
});

describe('OnlineClient messages', () => {
  function welcomed() {
    const setup = client();
    setup.online.start();
    setup.online.opened();
    setup.online.receive({ type: 'welcome', clientId: 'c1', sessionId: 's', resumed: false });
    return setup;
  }

  it('tracks the lobby, the host role, errors and leave reasons', () => {
    const { online } = welcomed();
    online.receive({ type: 'lobby', lobby: lobby() });
    expect(online.isHost).toBe(true);
    online.receive({ type: 'error', reason: 'lobbyFull' });
    expect(online.state.error).toBe('lobbyFull');
    online.receive({ type: 'lobbyLeft', reason: 'closed' });
    expect(online.state).toMatchObject({ lobby: undefined, leftReason: 'closed' });
    online.clearNotice();
    expect(online.state).toMatchObject({ error: undefined, leftReason: undefined });
  });

  it('joins a running match right after joining its lobby, but only when asked', () => {
    const { online, transport } = welcomed();
    const running = lobby({ state: 'playing', members: [{ id: 'c2', name: 'Ann', character: 3, host: true, connected: true, playerIndex: 0 }, { id: 'c1', name: 'Bob', character: 0, host: false, connected: true, playerIndex: null }] });
    online.joinLobby('l1', 0, true);
    online.receive({ type: 'lobby', lobby: running });
    online.receive({ type: 'lobby', lobby: running });
    expect(transport.sent.filter((message) => message.type === 'startGame')).toHaveLength(1);
    online.joinLobby('l1', 0);
    online.receive({ type: 'lobby', lobby: running });
    expect(transport.sent.filter((message) => message.type === 'startGame')).toHaveLength(1);
  });

  it('shows no leave notice when the player left on purpose', () => {
    const { online } = welcomed();
    online.receive({ type: 'lobby', lobby: lobby() });
    online.leaveLobby();
    online.receive({ type: 'lobbyLeft', reason: 'left' });
    expect(online.state.leftReason).toBeUndefined();
    online.receive({ type: 'lobby', lobby: lobby() });
    online.receive({ type: 'lobbyLeft', reason: 'left' });
    expect(online.state.leftReason).toBe('left');
  });

  it('starts a game once per match and routes frames and game over to the attached session', () => {
    const { online, starts } = welcomed();
    online.receive(START);
    expect(starts).toHaveLength(1);
    const frames: number[] = [];
    const overs: string[] = [];
    const sink: GameSink = {
      matchId: START.matchId,
      frame: (received) => frames.push(received.tick),
      upgrades: () => undefined,
      gameOver: (result) => overs.push(result.state),
      lost: () => undefined,
    };
    const detach = online.attachGame(sink);
    online.receive(START);
    expect(starts).toHaveLength(1);
    online.receive(frame(3));
    online.receive({ type: 'gameOver', matchId: 'other', state: 'quit', winnerName: null, score: 0 });
    online.receive({ type: 'gameOver', matchId: START.matchId, state: 'playerDead', winnerName: null, score: 10 });
    expect(frames).toEqual([3]);
    expect(overs).toEqual(['playerDead']);
    detach();
    online.receive(frame(4));
    expect(frames).toEqual([3]);
  });

  it('hands the upgrade list that arrived before the game screen to the session when it attaches', () => {
    const { online } = welcomed();
    const upgrade = { index: 3, name: 'upgrade.weaponPistol.fastFire', newWeapon: false, active: true } as const;
    online.receive(START);
    online.receive({ type: 'upgrades', upgrades: [upgrade] });
    const received: unknown[] = [];
    online.attachGame({ matchId: START.matchId, frame: () => undefined, upgrades: (list) => received.push(list), gameOver: () => undefined, lost: () => undefined });
    expect(received).toEqual([[upgrade]]);
    online.receive({ ...START, matchId: 'm2' });
    online.attachGame({ matchId: 'm2', frame: () => undefined, upgrades: (list) => received.push(list), gameOver: () => undefined, lost: () => undefined });
    expect(received).toEqual([[upgrade], []]);
  });

  it('tells the running game that the server lost the session', () => {
    const { online } = welcomed();
    let lost = 0;
    online.attachGame({ matchId: 'm1', frame: () => undefined, upgrades: () => undefined, gameOver: () => undefined, lost: () => lost++ });
    online.closed();
    online.opened();
    online.receive({ type: 'welcome', clientId: 'c9', sessionId: 's2', resumed: false });
    expect(lost).toBe(1);
  });
});
