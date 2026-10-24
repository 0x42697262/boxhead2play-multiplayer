import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { ClientActivity, MONITOR_PATH, type MonitorSnapshot } from '../../src/server/monitorProtocol.ts';
import { createMonitor, monitorAllowed, type MonitorAccess } from '../../src/server/node/monitor.ts';
import { OPTIONS, ROOM_ID, testHub } from './support.ts';

const TOKEN = 'a-long-monitor-token';
const LOOPBACK: MonitorAccess = { token: undefined, loopbackWithoutToken: true };

interface Captured {
  status: number | undefined;
  body: string;
}

function request(url: string, remoteAddress: string, authorization?: string): IncomingMessage {
  return { url, headers: authorization === undefined ? {} : { authorization }, socket: { remoteAddress } } as unknown as IncomingMessage;
}

function response(captured: Captured): ServerResponse {
  const fake = {
    writeHead(status: number) {
      captured.status = status;
      return fake;
    },
    end(body?: string) {
      captured.body = body ?? '';
      return fake;
    },
  };
  return fake as unknown as ServerResponse;
}

describe('server monitor', () => {
  it('needs the token when one is set, and otherwise allows loopback only where enabled', () => {
    const withToken: MonitorAccess = { token: TOKEN, loopbackWithoutToken: true };
    expect(monitorAllowed(withToken, '127.0.0.1', undefined)).toBe(false);
    expect(monitorAllowed(withToken, '203.0.113.9', `Bearer ${TOKEN}`)).toBe(true);
    expect(monitorAllowed(withToken, '127.0.0.1', 'Bearer wrong-token-of-length')).toBe(false);
    expect(monitorAllowed(LOOPBACK, '::1', undefined)).toBe(true);
    expect(monitorAllowed(LOOPBACK, '203.0.113.9', undefined)).toBe(false);
    expect(monitorAllowed({ token: undefined, loopbackWithoutToken: false }, '127.0.0.1', undefined)).toBe(false);
  });

  it('answers its path with clients, lobbies, traffic, CPU and memory, and leaves other paths alone', () => {
    const setup = testHub();
    const host = setup.connect('Ann');
    setup.connect('Bob');
    host.say({ type: 'createLobby', mode: GameMode.Coop, roomId: ROOM_ID, options: OPTIONS, character: 0 });
    host.say({ type: 'startGame' });
    setup.ticker.tick(3);
    const monitor = createMonitor({ hub: setup.hub, traffic: () => ({ bytesSent: 1234, bytesReceived: 56 }) }, LOOPBACK);
    const captured: Captured = { status: undefined, body: '' };
    expect(monitor.handle(request('/index.html', '127.0.0.1'), response(captured))).toBe(false);
    expect(monitor.handle(request(`${MONITOR_PATH}?x=1`, '203.0.113.9'), response(captured))).toBe(true);
    expect(captured.status).toBe(403);
    expect(monitor.handle(request(MONITOR_PATH, '127.0.0.1'), response(captured))).toBe(true);
    monitor.close();
    const snapshot = JSON.parse(captured.body) as MonitorSnapshot;
    expect(captured.status).toBe(200);
    expect(snapshot.traffic).toEqual({ bytesSent: 1234, bytesReceived: 56 });
    expect(snapshot.cpu.cores).toBeGreaterThan(0);
    expect(snapshot.memory.rss).toBeGreaterThan(0);
    const ann = snapshot.clients.find((client) => client.name === 'Ann');
    expect(ann).toMatchObject({ activity: ClientActivity.Playing, lobby: "Ann's game", mode: GameMode.Coop });
    expect(ann?.bytesSent).toBeGreaterThan(0);
    expect(snapshot.clients.find((client) => client.name === 'Bob')?.activity).toBe(ClientActivity.Menu);
    expect(snapshot.lobbies).toHaveLength(1);
    expect(snapshot.lobbies[0]?.tickMs).toBeGreaterThan(0);
    expect(snapshot.lobbies[0]?.matchSeconds).toBeGreaterThan(0);
    expect(snapshot.lobbies[0]?.ageSeconds).toBeGreaterThan(snapshot.lobbies[0]?.matchSeconds ?? 0);
    expect(ann?.onlineSeconds).toBeGreaterThan(0);
  });
});
