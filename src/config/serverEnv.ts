import { z } from 'zod';
import { booleanString, LogLevel } from './env.ts';

const DEFAULT_PORT = 8080;
const PORT_MAX = 65_535;
const MONITOR_TOKEN_MIN_LENGTH = 16;
const DEFAULT_SOCKETS_PER_ADDRESS = 16;
const DEFAULT_SESSIONS_PER_ADDRESS = 8;
const DEFAULT_LOBBIES_PER_ADDRESS = 4;

export const UNLIMITED = 0;

export interface AddressLimits {
  readonly socketsPerAddress: number;
  readonly sessionsPerAddress: number;
  readonly lobbiesPerAddress: number;
}

export const NO_ADDRESS_LIMITS: AddressLimits = Object.freeze({ socketsPerAddress: UNLIMITED, sessionsPerAddress: UNLIMITED, lobbiesPerAddress: UNLIMITED });

const limit = (fallback: number) => z.coerce.number().int().min(UNLIMITED).default(fallback);

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(PORT_MAX).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('0.0.0.0'),
  BOXHEAD_ASSET_DIR: z.string().min(1).default('dist/assets'),
  BOXHEAD_STATIC_DIR: z.string().min(1).default('dist'),
  LOG_LEVEL: z.enum([LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]).default(LogLevel.Info),
  BOXHEAD_MONITOR_TOKEN: z.string().min(MONITOR_TOKEN_MIN_LENGTH).optional(),
  BOXHEAD_MAX_SOCKETS_PER_ADDRESS: limit(DEFAULT_SOCKETS_PER_ADDRESS),
  BOXHEAD_MAX_SESSIONS_PER_ADDRESS: limit(DEFAULT_SESSIONS_PER_ADDRESS),
  BOXHEAD_MAX_LOBBIES_PER_ADDRESS: limit(DEFAULT_LOBBIES_PER_ADDRESS),
  BOXHEAD_TRUST_PROXY: booleanString,
});

export interface ServerSettings {
  readonly port: number;
  readonly host: string;
  readonly assetDir: string;
  readonly staticDir: string;
  readonly logLevel: LogLevel;
  readonly monitorToken: string | undefined;
  readonly addressLimits: AddressLimits;
  readonly trustProxy: boolean;
}

export class ServerConfigError extends Error {}

export function loadServerSettings(rawEnv: Record<string, unknown>): ServerSettings {
  const parsed = serverEnvSchema.safeParse(rawEnv);
  if (!parsed.success) throw new ServerConfigError(z.prettifyError(parsed.error));
  const env = parsed.data;
  return Object.freeze({
    port: env.PORT,
    host: env.HOST,
    assetDir: env.BOXHEAD_ASSET_DIR,
    staticDir: env.BOXHEAD_STATIC_DIR,
    logLevel: env.LOG_LEVEL,
    monitorToken: env.BOXHEAD_MONITOR_TOKEN,
    addressLimits: Object.freeze({
      socketsPerAddress: env.BOXHEAD_MAX_SOCKETS_PER_ADDRESS,
      sessionsPerAddress: env.BOXHEAD_MAX_SESSIONS_PER_ADDRESS,
      lobbiesPerAddress: env.BOXHEAD_MAX_LOBBIES_PER_ADDRESS,
    }),
    trustProxy: env.BOXHEAD_TRUST_PROXY,
  });
}
