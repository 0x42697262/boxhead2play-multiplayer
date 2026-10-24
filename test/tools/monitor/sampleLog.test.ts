import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientActivity, MONITOR_FORMAT_VERSION, type MonitorClient, type MonitorSnapshot } from '../../../src/server/monitorProtocol.ts';
import { DEFAULT_LOG_DIR_NAME, errorEntry, logDirectory, logFileName, SampleLog, sampleEntry } from '../../../tools/monitor/sampleLog.ts';

const TEMP = '/tmp-root';
const URL = 'https://game.example';
const STARTED = new Date('2026-10-25T01:02:03.456Z');

function client(bytesSent: number): MonitorClient {
  return { id: 'c1', name: 'ANN', activity: ClientActivity.Playing, lobby: "Ann's game", mode: 'coop', onlineSeconds: 10, bytesSent, bytesReceived: bytesSent / 10 };
}

function snapshot(timeMs: number, cpuMicros: number, bytesSent: number): MonitorSnapshot {
  return {
    formatVersion: MONITOR_FORMAT_VERSION,
    timeMs,
    uptimeSeconds: 60,
    cpu: { userMicros: cpuMicros, systemMicros: 0, cores: 1 },
    memory: { rss: 1, heapUsed: 1, heapTotal: 1, systemTotal: 2, systemFree: 1 },
    loadAverage: [0, 0, 0],
    eventLoopDelayMs: { mean: 44.2, p99: 291.2, max: 291.2, windowMs: 1000 },
    traffic: { bytesSent, bytesReceived: 0 },
    clients: [client(bytesSent)],
    lobbies: [],
  };
}

describe('monitor sample log', () => {
  const made: string[] = [];
  afterEach(() => {
    for (const directory of made.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it('is off without --log, uses the temp directory for a bare --log and a given directory otherwise', () => {
    expect(logDirectory(['--url', URL], TEMP)).toBeUndefined();
    expect(logDirectory(['--log'], TEMP)).toBe(path.join(TEMP, DEFAULT_LOG_DIR_NAME));
    expect(logDirectory(['--log', '--url', URL], TEMP)).toBe(path.join(TEMP, DEFAULT_LOG_DIR_NAME));
    expect(logDirectory(['--log', 'logs/monitor'], TEMP)).toBe('logs/monitor');
  });

  it('names the file after the start time without characters that file systems reject', () => {
    expect(logFileName(STARTED)).toBe('monitor-2026-10-25T01-02-03-456Z.jsonl');
  });

  it('adds CPU percent and per-player rates once a previous sample exists', () => {
    const first = sampleEntry(URL, STARTED, undefined, snapshot(1000, 0, 0));
    expect(first).toMatchObject({ cpuPercent: null, clientRates: [] });
    const second = sampleEntry(URL, STARTED, snapshot(1000, 0, 0), snapshot(2000, 500_000, 4096));
    expect(second).toMatchObject({ url: URL, receivedAt: STARTED.toISOString(), cpuPercent: 50, clientRates: [{ id: 'c1', name: 'ANN', sentPerSecond: 4096 }] });
  });

  it('appends one JSON line per sample or error to the file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'monitor-log-'));
    made.push(directory);
    const log = SampleLog.open(path.join(directory, 'nested'), STARTED);
    log.write(sampleEntry(URL, STARTED, undefined, snapshot(1000, 0, 0)));
    log.write(errorEntry(URL, STARTED, 'No sample: timeout'));
    const lines = readFileSync(log.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveProperty('snapshot.eventLoopDelayMs.p99', 291.2);
    expect(lines[1]).toEqual({ receivedAt: STARTED.toISOString(), url: URL, error: 'No sample: timeout' });
  });
});
