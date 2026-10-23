import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../../src/adapters/storage/KeyValueStore.ts';
import { GameMode } from '../../../src/domain/world/GameMode.ts';
import type { GameStarted } from '../../../src/net/protocol.ts';
import { silentLogger } from '../../../src/observability/logger.ts';
import { OnlineClient, OnlineStatus, SESSION_STORAGE_KEY, type GameSink } from '../../../src/services/online/OnlineClient.ts';
import { FakeTransport, frame, lobby, OPTIONS, START } from './support.ts';

function client(session = new MemoryStore()) {
  const starts: GameStarted[] = [];
  const transport = new FakeTransport();
  const online = new OnlineClient({ session, name: () => 'Ann', logger: silentLogger, onGameStarted: (start) => starts.push(start) });
  online.bind(transport);
  return { online, transport, starts, session };
}

describe('OnlineClient connection', () => {
  it('says hello with the stored session, queues requests until welcome and stores the new session id', () => {
    const session = new MemoryStore();
    session.write(SESSION_STORAGE_KEY, 'old');
    const { online, transport } = client(session);
    online.start();
    expect(online.state.status).toBe(OnlineStatus.Connecting);
    online.watch(GameMode.Coop);
    online.createLobby(GameMode.Coop, 'ROOM_Single_0001', OPTIONS, 3);
    online.opened();
    expect(transport.sent).toEqual([{ type: 'hello', version: 1, sessionId: 'old', name: 'Ann' }]);
    online.receive({ type: 'welcome', clientId: 'c1', sessionId: 'new', resumed: false });
    expect(transport.types()).toEqual(['hello', 'watchLobbies', 'createLobby']);
    expect(session.read(SESSION_STORAGE_KEY)).toBe('new');
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
