import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { availableParallelism, freemem, loadavg, totalmem } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Hub } from '../Hub.ts';
import {
  MONITOR_FORMAT_VERSION,
  MONITOR_PATH,
  MONITOR_TOKEN_HEADER,
  MONITOR_TOKEN_SCHEME,
  type EventLoopDelay,
  type MonitorSnapshot,
  type Traffic,
} from '../monitorProtocol.ts';
import { EVENT_LOOP_RESOLUTION_MS, EVENT_LOOP_WINDOW_MS, NANOS_PER_MS } from '../tuning.ts';
import { requestPathname } from './requestPath.ts';

const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HTTP_OK = 200;
const P99 = 99;
const HTTP_FORBIDDEN = 403;
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;
const NO_DELAY: EventLoopDelay = { mean: 0, p99: 0, max: 0, windowMs: EVENT_LOOP_WINDOW_MS };

export interface MonitorAccess {
  readonly token: string | undefined;
  readonly loopbackWithoutToken: boolean;
}

export interface MonitorSources {
  readonly hub: Hub;
  traffic(): Traffic;
}

export interface Monitor {
  handle(request: IncomingMessage, response: ServerResponse): boolean;
  close(): void;
}

interface EventLoopWindow {
  latest(): EventLoopDelay;
  close(): void;
}

const DISABLED_MONITOR: Monitor = {
  handle: () => false,
  close: () => undefined,
};

function sameSecret(given: string, expected: string): boolean {
  const first = Buffer.from(given);
  const second = Buffer.from(expected);
  return first.length === second.length && timingSafeEqual(first, second);
}

function lateMs(nanos: number): number {
  return Math.max(0, nanos / NANOS_PER_MS - EVENT_LOOP_RESOLUTION_MS);
}

function eventLoopWindow(): EventLoopWindow {
  const histogram = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS });
  histogram.enable();
  let latest = NO_DELAY;
  const timer = setInterval(() => {
    latest =
      histogram.count > 0
        ? { mean: lateMs(histogram.mean), p99: lateMs(histogram.percentile(P99)), max: lateMs(histogram.max), windowMs: EVENT_LOOP_WINDOW_MS }
        : NO_DELAY;
    histogram.reset();
  }, EVENT_LOOP_WINDOW_MS);
  timer.unref();
  return {
    latest: () => latest,
    close() {
      clearInterval(timer);
      histogram.disable();
    },
  };
}

export function monitorEnabled(access: MonitorAccess): boolean {
  return access.token !== undefined || access.loopbackWithoutToken;
}

export function monitorAllowed(access: MonitorAccess, remoteAddress: string | undefined, authorization: string | undefined): boolean {
  if (access.token !== undefined) return authorization !== undefined && sameSecret(authorization, `${MONITOR_TOKEN_SCHEME}${access.token}`);
  return access.loopbackWithoutToken && remoteAddress !== undefined && LOOPBACK_ADDRESSES.has(remoteAddress);
}

export function createMonitor(sources: MonitorSources, access: MonitorAccess): Monitor {
  if (!monitorEnabled(access)) return DISABLED_MONITOR;
  const loop = eventLoopWindow();
  const snapshot = (): MonitorSnapshot => {
    const cpu = process.cpuUsage();
    const memory = process.memoryUsage();
    return {
      formatVersion: MONITOR_FORMAT_VERSION,
      timeMs: Date.now(),
      uptimeSeconds: process.uptime(),
      cpu: { userMicros: cpu.user, systemMicros: cpu.system, cores: availableParallelism() },
      memory: { rss: memory.rss, heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, systemTotal: totalmem(), systemFree: freemem() },
      loadAverage: loadavg(),
      eventLoopDelayMs: loop.latest(),
      traffic: sources.traffic(),
      clients: sources.hub.monitorClients(),
      lobbies: sources.hub.monitorLobbies(),
    };
  };
  return {
    handle(request, response) {
      if (requestPathname(request.url) !== MONITOR_PATH) return false;
      const header = request.headers[MONITOR_TOKEN_HEADER];
      if (!monitorAllowed(access, request.socket.remoteAddress, typeof header === 'string' ? header : undefined)) {
        response.writeHead(HTTP_FORBIDDEN, JSON_HEADERS).end();
        return true;
      }
      response.writeHead(HTTP_OK, JSON_HEADERS).end(JSON.stringify(snapshot()));
      return true;
    },
    close() {
      loop.close();
    },
  };
}
