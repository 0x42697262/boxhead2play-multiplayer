import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { ClientActivity, MONITOR_PATH, type MonitorSnapshot } from '../../src/server/monitorProtocol.ts';
import { createMonitor, monitorAllowed, type MonitorAccess } from '../../src/server/node/monitor.ts';
import { EVENT_LOOP_WINDOW_MS } from '../../src/server/tuning.ts';
import { OPTIONS, ROOM_ID, testHub } from './support.ts';

const histograms = vi.hoisted(() => ({
  created: 0,
  resets: 0,
  enabled: false,
  count: 0,
  meanNanos: 0,
  p99Nanos: 0,
  maxNanos: 0,
}));

vi.mock('node:perf_hooks', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  monitorEventLoopDelay: () => {
    histograms.created++;
    return {
      enable: () => {
        histograms.enabled = true;
      },
      disable: () => {
        histograms.enabled = false;
      },
      reset: () => {
        histograms.resets++;
      },
      percentile: () => histograms.p99Nanos,
      get count() {
        return histograms.count;
      },
      get mean() {
        return histograms.meanNanos;
      },
      get max() {
        return histograms.maxNanos;
      },
    };
  },
}));

afterEach(() => {
  vi.useRealTimers();
});

const TOKEN = 'a-long-monitor-token';
const LOOPBACK: MonitorAccess = { token: undefined, loopbackWithoutToken: true };
const DISABLED: MonitorAccess = { token: undefined, loopbackWithoutToken: false };
const NANOS_PER_MS = 1_000_000;

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

  it('does not exist without a token or loopback access: no histogram, other handlers answer its path', () => {
    const created = histograms.created;
    const monitor = createMonitor({ hub: testHub().hub, traffic: () => ({ bytesSent: 0, bytesReceived: 0 }) }, DISABLED);
    const captured: Captured = { status: undefined, body: '' };
    expect(monitor.handle(request(MONITOR_PATH, '127.0.0.1'), response(captured))).toBe(false);
    expect(captured.status).toBeUndefined();
    monitor.close();
    expect(histograms.created).toBe(created);
  });

  it('reports the event loop delay of the last full window, the same for every request', () => {
    vi.useFakeTimers();
    const resets = histograms.resets;
    const monitor = createMonitor({ hub: testHub().hub, traffic: () => ({ bytesSent: 0, bytesReceived: 0 }) }, LOOPBACK);
    const delay = (): MonitorSnapshot['eventLoopDelayMs'] => {
      const captured: Captured = { status: undefined, body: '' };
      monitor.handle(request(MONITOR_PATH, '127.0.0.1'), response(captured));
      return (JSON.parse(captured.body) as MonitorSnapshot).eventLoopDelayMs;
    };
    expect(delay()).toEqual({ mean: 0, p99: 0, max: 0, windowMs: EVENT_LOOP_WINDOW_MS });
    Object.assign(histograms, { count: 3, meanNanos: 12 * NANOS_PER_MS, p99Nanos: 20 * NANOS_PER_MS, maxNanos: 30 * NANOS_PER_MS });
    vi.advanceTimersByTime(EVENT_LOOP_WINDOW_MS);
    const first = delay();
    const second = delay();
    expect(first).toEqual({ mean: 2, p99: 10, max: 20, windowMs: EVENT_LOOP_WINDOW_MS });
    expect(second).toEqual(first);
    expect(histograms.resets - resets).toBe(1);
    monitor.close();
    expect(histograms.enabled).toBe(false);
  });

  it('ignores a request URL it cannot parse', () => {
    const monitor = createMonitor({ hub: testHub().hub, traffic: () => ({ bytesSent: 0, bytesReceived: 0 }) }, LOOPBACK);
    expect(monitor.handle(request('//[', '127.0.0.1'), response({ status: undefined, body: '' }))).toBe(false);
    monitor.close();
  });
});
