import type { LogLevel } from '../config/env.ts';
import type { LogEvent } from '../text/logEvents.ts';

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(event: LogEvent, fields?: LogFields): void;
  info(event: LogEvent, fields?: LogFields): void;
  warn(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
}

export interface LogSink {
  write(level: LogLevel, line: string): void;
}

export const consoleSink: LogSink = {
  write(level, line) {
    const method = level === 'debug' ? 'debug' : level;
    console[method](line);
  },
};

export function createLogger(minLevel: LogLevel, sessionId: string, sink: LogSink = consoleSink): Logger {
  const emit = (level: LogLevel, event: LogEvent, fields: LogFields = {}): void => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    sink.write(level, JSON.stringify({ level, event, sessionId, ...fields }));
  };
  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
