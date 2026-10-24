import type { MonitorSnapshot } from '../../src/server/monitorProtocol.ts';
import { MONITOR_FORMAT_VERSION, MONITOR_PATH, MONITOR_TOKEN_SCHEME } from '../../src/server/monitorProtocol.ts';
import { httpErrorText, renderView } from './view.ts';

const DEFAULT_URL = 'http://localhost:5173';
const DEFAULT_INTERVAL_MS = 1000;
const MIN_INTERVAL_MS = 200;
const REQUEST_TIMEOUT_MS = 2000;
const FALLBACK_COLUMNS = 120;
const FALLBACK_ROWS = 40;
const CTRL_C = '\u0003';
const QUIT_KEYS: ReadonlySet<string> = new Set(['q', 'Q', CTRL_C]);
const ENTER_SCREEN = '\u001b[?1049h\u001b[?25l';
const LEAVE_SCREEN = '\u001b[?25h\u001b[?1049l';
const HOME = '\u001b[H';
const CLEAR_LINE_END = '\u001b[K';
const CLEAR_SCREEN_END = '\u001b[J';
const USAGE = `Usage: npm run monitor -- [--url ${DEFAULT_URL}] [--token TOKEN] [--interval ${DEFAULT_INTERVAL_MS}] [--once]
  --url       game server address (env BOXHEAD_MONITOR_URL); the dev server answers loopback requests
  --token     BOXHEAD_MONITOR_TOKEN of a production server (env BOXHEAD_MONITOR_TOKEN)
  --interval  milliseconds between samples
  --once      print two samples one interval apart and exit`;

interface Options {
  readonly url: string;
  readonly token: string | undefined;
  readonly intervalMs: number;
  readonly once: boolean;
}

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseOptions(args: readonly string[]): Options {
  const interval = Number(argument(args, '--interval') ?? DEFAULT_INTERVAL_MS);
  return {
    url: (argument(args, '--url') ?? process.env.BOXHEAD_MONITOR_URL ?? DEFAULT_URL).replace(/\/+$/, ''),
    token: argument(args, '--token') ?? process.env.BOXHEAD_MONITOR_TOKEN,
    intervalMs: Number.isFinite(interval) ? Math.max(MIN_INTERVAL_MS, interval) : DEFAULT_INTERVAL_MS,
    once: args.includes('--once'),
  };
}

async function sample(options: Options): Promise<MonitorSnapshot> {
  const headers: Record<string, string> = options.token ? { authorization: `${MONITOR_TOKEN_SCHEME}${options.token}` } : {};
  const response = await fetch(`${options.url}${MONITOR_PATH}`, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(httpErrorText(response.status));
  const snapshot = (await response.json()) as MonitorSnapshot;
  if (snapshot.formatVersion !== MONITOR_FORMAT_VERSION) throw new Error(`monitor format ${snapshot.formatVersion}, this tool reads ${MONITOR_FORMAT_VERSION}`);
  return snapshot;
}

function errorText(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : '';
  return error instanceof Error ? `${error.message}${cause}` : String(error);
}

async function runOnce(options: Options): Promise<void> {
  const previous = await sample(options);
  await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  const current = await sample(options);
  const lines = renderView({ url: options.url, previous, current, error: undefined, width: process.stdout.columns ?? FALLBACK_COLUMNS, height: Number.MAX_SAFE_INTEGER });
  process.stdout.write(`${lines.join('\n')}\n`);
}

function runLive(options: Options): void {
  let previous: MonitorSnapshot | undefined;
  let current: MonitorSnapshot | undefined;
  let error: string | undefined;
  const draw = (): void => {
    const lines = renderView({ url: options.url, previous, current, error, width: process.stdout.columns || FALLBACK_COLUMNS, height: process.stdout.rows || FALLBACK_ROWS });
    process.stdout.write(`${HOME}${lines.join(`${CLEAR_LINE_END}\n`)}${CLEAR_LINE_END}${CLEAR_SCREEN_END}`);
  };
  const poll = async (): Promise<void> => {
    try {
      const next = await sample(options);
      previous = current;
      current = next;
      error = undefined;
    } catch (failure) {
      error = `No sample: ${errorText(failure)}`;
    }
    draw();
  };
  const timer = setInterval(() => void poll(), options.intervalMs);
  const quit = (): void => {
    clearInterval(timer);
    process.stdout.write(LEAVE_SCREEN);
    process.exit(0);
  };
  process.stdout.write(ENTER_SCREEN);
  process.stdout.on('resize', draw);
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data: Buffer) => {
      if (QUIT_KEYS.has(data.toString())) quit();
    });
  }
  draw();
  void poll();
}

const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write(`${USAGE}\n`);
} else {
  const options = parseOptions(args);
  if (options.once || !process.stdout.isTTY) {
    runOnce(options).catch((failure: unknown) => {
      process.stderr.write(`No sample from ${options.url}: ${errorText(failure)}\n`);
      process.exitCode = 1;
    });
  } else {
    runLive(options);
  }
}
