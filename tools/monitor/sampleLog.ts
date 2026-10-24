import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { MonitorSnapshot } from '../../src/server/monitorProtocol.ts';
import { clientRates, cpuPercent } from './view.ts';

export const LOG_FLAG = '--log';
export const DEFAULT_LOG_DIR_NAME = 'boxhead2play-monitor';
const OPTION_PREFIX = '--';
const LOG_FILE_PREFIX = 'monitor-';
const LOG_FILE_SUFFIX = '.jsonl';
const FILE_UNSAFE_TIME_CHARACTERS = /[:.]/g;
const FILE_SAFE_SEPARATOR = '-';

interface LoggedClientRate {
  readonly id: string;
  readonly name: string;
  readonly sentPerSecond: number;
  readonly receivedPerSecond: number;
}

export type SampleLogEntry =
  | {
      readonly receivedAt: string;
      readonly url: string;
      readonly cpuPercent: number | null;
      readonly clientRates: readonly LoggedClientRate[];
      readonly snapshot: MonitorSnapshot;
    }
  | { readonly receivedAt: string; readonly url: string; readonly error: string };

export function logDirectory(args: readonly string[], tempDirectory: string): string | undefined {
  const index = args.indexOf(LOG_FLAG);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value !== undefined && !value.startsWith(OPTION_PREFIX) ? value : path.join(tempDirectory, DEFAULT_LOG_DIR_NAME);
}

export function logFileName(startedAt: Date): string {
  return `${LOG_FILE_PREFIX}${startedAt.toISOString().replace(FILE_UNSAFE_TIME_CHARACTERS, FILE_SAFE_SEPARATOR)}${LOG_FILE_SUFFIX}`;
}

export function sampleEntry(url: string, receivedAt: Date, previous: MonitorSnapshot | undefined, snapshot: MonitorSnapshot): SampleLogEntry {
  return {
    receivedAt: receivedAt.toISOString(),
    url,
    cpuPercent: previous ? cpuPercent(previous, snapshot) : null,
    clientRates: previous
      ? clientRates(previous, snapshot).map(({ client, sentPerSecond, receivedPerSecond }) => ({ id: client.id, name: client.name, sentPerSecond, receivedPerSecond }))
      : [],
    snapshot,
  };
}

export function errorEntry(url: string, receivedAt: Date, error: string): SampleLogEntry {
  return { receivedAt: receivedAt.toISOString(), url, error };
}

export function logLine(entry: SampleLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

export class SampleLog {
  readonly file: string;

  private constructor(file: string) {
    this.file = file;
  }

  static open(directory: string, startedAt: Date): SampleLog {
    mkdirSync(directory, { recursive: true });
    return new SampleLog(path.join(directory, logFileName(startedAt)));
  }

  write(entry: SampleLogEntry): void {
    appendFileSync(this.file, logLine(entry));
  }
}
