export const MONITOR_PATH = '/__monitor';
export const MONITOR_FORMAT_VERSION = 1;
export const MONITOR_TOKEN_HEADER = 'authorization';
export const MONITOR_TOKEN_SCHEME = 'Bearer ';

export interface Traffic {
  readonly bytesSent: number;
  readonly bytesReceived: number;
}

export const ClientActivity = {
  Offline: 'offline',
  Menu: 'menu',
  Lobby: 'lobby',
  Playing: 'playing',
} as const;

export type ClientActivity = (typeof ClientActivity)[keyof typeof ClientActivity];

export interface MonitorClient extends Traffic {
  readonly id: string;
  readonly name: string;
  readonly activity: ClientActivity;
  readonly lobby: string | null;
  readonly mode: string | null;
}

export interface MonitorLobby {
  readonly id: string;
  readonly name: string;
  readonly mode: string;
  readonly state: string;
  readonly members: number;
  readonly tickMs: number | null;
}

export interface MonitorSnapshot {
  readonly formatVersion: number;
  readonly timeMs: number;
  readonly uptimeSeconds: number;
  readonly cpu: { readonly userMicros: number; readonly systemMicros: number; readonly cores: number };
  readonly memory: { readonly rss: number; readonly heapUsed: number; readonly heapTotal: number; readonly systemTotal: number; readonly systemFree: number };
  readonly loadAverage: readonly number[];
  readonly eventLoopDelayMs: { readonly mean: number; readonly p99: number; readonly max: number };
  readonly traffic: Traffic;
  readonly clients: readonly MonitorClient[];
  readonly lobbies: readonly MonitorLobby[];
}
