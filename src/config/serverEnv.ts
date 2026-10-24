import { z } from 'zod';
import { LogLevel } from './env.ts';

const DEFAULT_PORT = 8080;
const PORT_MAX = 65_535;
const MONITOR_TOKEN_MIN_LENGTH = 16;

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(PORT_MAX).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('0.0.0.0'),
  BOXHEAD_ASSET_DIR: z.string().min(1).default('dist/assets'),
  BOXHEAD_STATIC_DIR: z.string().min(1).default('dist'),
  LOG_LEVEL: z.enum([LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]).default(LogLevel.Info),
  BOXHEAD_MONITOR_TOKEN: z.string().min(MONITOR_TOKEN_MIN_LENGTH).optional(),
});

export interface ServerSettings {
  readonly port: number;
  readonly host: string;
  readonly assetDir: string;
  readonly staticDir: string;
  readonly logLevel: LogLevel;
  readonly monitorToken: string | undefined;
}

export class ServerConfigError extends Error {}

export function loadServerSettings(rawEnv: Record<string, unknown>): ServerSettings {
  const parsed = serverEnvSchema.safeParse(rawEnv);
  if (!parsed.success) throw new ServerConfigError(z.prettifyError(parsed.error));
  const env = parsed.data;
  return Object.freeze({ port: env.PORT, host: env.HOST, assetDir: env.BOXHEAD_ASSET_DIR, staticDir: env.BOXHEAD_STATIC_DIR, logLevel: env.LOG_LEVEL, monitorToken: env.BOXHEAD_MONITOR_TOKEN });
}
