import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const LogLevel = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const envSchema = z.object({
  VITE_ASSET_BASE_URL: z.string().min(1).default('assets/'),
  VITE_DEBUG_OVERLAY: booleanString,
  VITE_LOG_LEVEL: z.enum([LogLevel.Debug, LogLevel.Info, LogLevel.Warn, LogLevel.Error]).default(LogLevel.Info),
});

export interface Settings {
  readonly assetBaseUrl: string;
  readonly debugOverlay: boolean;
  readonly logLevel: LogLevel;
}

export class ConfigError extends Error {}

export function loadSettings(rawEnv: Record<string, unknown>): Settings {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    throw new ConfigError(z.prettifyError(parsed.error));
  }
  const env = parsed.data;
  return Object.freeze({
    assetBaseUrl: env.VITE_ASSET_BASE_URL.endsWith('/') ? env.VITE_ASSET_BASE_URL : `${env.VITE_ASSET_BASE_URL}/`,
    debugOverlay: env.VITE_DEBUG_OVERLAY,
    logLevel: env.VITE_LOG_LEVEL,
  });
}

export function readBrowserEnv(): Record<string, unknown> {
  return { ...import.meta.env };
}
