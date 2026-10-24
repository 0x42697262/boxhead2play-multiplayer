import { describe, expect, it } from 'vitest';
import { ClientActivity, MONITOR_FORMAT_VERSION, type MonitorClient, type MonitorSnapshot } from '../../../src/server/monitorProtocol.ts';
import { clientRates, cpuPercent, fit, formatBytes, formatDuration, httpErrorText, isNewerSample, renderView } from '../../../tools/monitor/view.ts';

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

function client(name: string, bytesSent: number): MonitorClient {
  return { id: name, name, activity: ClientActivity.Playing, lobby: "Ann's game", mode: 'coop', onlineSeconds: 754, bytesSent, bytesReceived: bytesSent / 10 };
}

function snapshot(timeMs: number, cpuMicros: number, clients: readonly MonitorClient[]): MonitorSnapshot {
  return {
    formatVersion: MONITOR_FORMAT_VERSION,
    timeMs,
    uptimeSeconds: 3725,
    cpu: { userMicros: cpuMicros, systemMicros: 0, cores: 8 },
    memory: { rss: 150 * 1024 * 1024, heapUsed: 40 * 1024 * 1024, heapTotal: 80 * 1024 * 1024, systemTotal: 16 * 1024 ** 3, systemFree: 8 * 1024 ** 3 },
    loadAverage: [0.5, 0.4, 0.3],
    eventLoopDelayMs: { mean: 0.2, p99: 1.5, max: 2, windowMs: 1000 },
    traffic: { bytesSent: clients.reduce((sum, item) => sum + item.bytesSent, 0), bytesReceived: 0 },
    clients,
    lobbies: [{ id: 'l1', name: "Ann's game", mode: 'coop', state: 'playing', members: 2, tickMs: 1.25, ageSeconds: 4000, matchSeconds: 95 }],
  };
}

describe('monitor view', () => {
  it('accepts only samples newer than the shown one', () => {
    expect(isNewerSample(snapshot(1000, 0, []), snapshot(2000, 0, []))).toBe(true);
    expect(isNewerSample(snapshot(2000, 0, []), snapshot(2000, 0, []))).toBe(false);
    expect(isNewerSample(snapshot(2000, 0, []), snapshot(1000, 0, []))).toBe(false);
  });

  it('formats bytes, durations and CPU time as htop-like numbers', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MiB');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(cpuPercent(snapshot(0, 0, []), snapshot(2000, 500_000, []))).toBeCloseTo(25);
    expect(cpuPercent(undefined, snapshot(0, 0, []))).toBe(0);
  });

  it('turns byte counters into per-second rates, busiest first, and survives a reconnect reset', () => {
    const before = snapshot(0, 0, [client('Ann', 1000), client('Bob', 5000)]);
    const after = snapshot(2000, 0, [client('Ann', 3000), client('Bob', 1000), client('Cy', 50)]);
    const rates = clientRates(before, after);
    expect(rates.map((rate) => [rate.client.name, rate.sentPerSecond])).toEqual([
      ['Ann', 1000],
      ['Bob', 500],
      ['Cy', 0],
    ]);
  });

  it('renders the header, system lines, lobbies and players within the terminal size', () => {
    const lines = renderView({ url: 'http://localhost:5173', previous: snapshot(0, 0, [client('Ann', 0)]), current: snapshot(1000, 100_000, [client('Ann', 2048)]), error: undefined, width: 120, height: 30 });
    const text = lines.map((line) => line.replace(ANSI, ''));
    expect(text[0]).toContain('up 1:02:05');
    expect(text.find((line) => line.startsWith('CPU'))).toContain('10.0% of one core (8 cores)');
    expect(text.find((line) => line.startsWith('NET'))).toContain('↑ 2.0 KiB/s');
    expect(text.find((line) => line.startsWith("Ann's game"))).toMatch(/1\.3 ms\s+0:01:35\s+1:06:40/);
    expect(text.find((line) => line.startsWith('Ann '))).toMatch(/0:12:34\s+2\.0 KiB\/s/);
    expect(text.every((line) => line.length <= 120)).toBe(true);
    expect(renderView({ url: 'u', previous: undefined, current: snapshot(0, 0, Array.from({ length: 50 }, (_unused, index) => client(`P${index}`, index))), error: undefined, width: 100, height: 20 })).toHaveLength(20);
  });

  it('explains a missing monitor and a refused token', () => {
    expect(httpErrorText(404)).toContain('BOXHEAD_MONITOR_TOKEN');
    expect(httpErrorText(403)).toContain('--token');
    expect(httpErrorText(500)).toBe('HTTP 500');
  });

  it('shows the connection error and cuts long lines without breaking colors', () => {
    const lines = renderView({ url: 'u', previous: undefined, current: undefined, error: 'No sample: HTTP 403', width: 40, height: 10 });
    expect(lines[1]?.replace(ANSI, '')).toBe('No sample: HTTP 403');
    expect(fit('\u001b[31mabcdef\u001b[0m', 3).replace(ANSI, '')).toBe('abc');
  });
});
