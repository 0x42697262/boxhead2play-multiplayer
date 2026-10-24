import type { MonitorClient, MonitorSnapshot } from '../../src/server/monitorProtocol.ts';

const ESC = '\u001b[';
export const Style = {
  Reset: `${ESC}0m`,
  Bold: `${ESC}1m`,
  Dim: `${ESC}2m`,
  Inverse: `${ESC}7m`,
  Green: `${ESC}32m`,
  Yellow: `${ESC}33m`,
  Red: `${ESC}31m`,
  Cyan: `${ESC}36m`,
} as const;

const ANSI_PATTERN = new RegExp(`${ESC.replace('[', '\\[')}[0-9;]*m`, 'g');
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const BYTES_PER_UNIT = 1024;
const MICROS_PER_SECOND = 1_000_000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const PERCENT = 100;
const BAR_WIDTH = 24;
const BAR_FULL = '█';
const BAR_EMPTY = '░';
const WARN_FRACTION = 0.6;
const ALERT_FRACTION = 0.85;
const TICK_BUDGET_MS = 40;
const LOAD_DIGITS = 2;
const DELAY_DIGITS = 1;
const HEADER_ROWS = 9;
const MIN_TABLE_ROWS = 1;
const LOBBY_SHARE = 3;
const TABLE_CHROME_ROWS = 3;
const NAME_WIDTH = 18;
const LOBBY_WIDTH = 18;
const MODE_WIDTH = 11;
const STATE_WIDTH = 9;
const NUMBER_WIDTH = 10;
const SMALL_NUMBER_WIDTH = 8;

export interface ViewInput {
  readonly url: string;
  readonly previous: MonitorSnapshot | undefined;
  readonly current: MonitorSnapshot | undefined;
  readonly error: string | undefined;
  readonly width: number;
  readonly height: number;
}

export interface ClientRate {
  readonly client: MonitorClient;
  readonly sentPerSecond: number;
  readonly receivedPerSecond: number;
}

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unit++;
  }
  return `${unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${BYTE_UNITS[unit] ?? ''}`;
}

export function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function levelColor(fraction: number): string {
  if (fraction >= ALERT_FRACTION) return Style.Red;
  return fraction >= WARN_FRACTION ? Style.Yellow : Style.Green;
}

export function bar(fraction: number, width = BAR_WIDTH): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return `[${levelColor(clamped)}${BAR_FULL.repeat(filled)}${Style.Dim}${BAR_EMPTY.repeat(width - filled)}${Style.Reset}]`;
}

function elapsedSeconds(previous: MonitorSnapshot, current: MonitorSnapshot): number {
  return Math.max(1, current.timeMs - previous.timeMs) / MS_PER_SECOND;
}

function rate(before: number, after: number, seconds: number): number {
  return after >= before ? (after - before) / seconds : after / seconds;
}

export function cpuPercent(previous: MonitorSnapshot | undefined, current: MonitorSnapshot): number {
  if (!previous) return 0;
  const used = current.cpu.userMicros + current.cpu.systemMicros - previous.cpu.userMicros - previous.cpu.systemMicros;
  return Math.max(0, (used / MICROS_PER_SECOND / elapsedSeconds(previous, current)) * PERCENT);
}

export function clientRates(previous: MonitorSnapshot | undefined, current: MonitorSnapshot): ClientRate[] {
  const before = new Map(previous?.clients.map((client) => [client.id, client]) ?? []);
  const seconds = previous ? elapsedSeconds(previous, current) : 1;
  return current.clients
    .map((client) => {
      const old = before.get(client.id);
      return {
        client,
        sentPerSecond: old ? rate(old.bytesSent, client.bytesSent, seconds) : 0,
        receivedPerSecond: old ? rate(old.bytesReceived, client.bytesReceived, seconds) : 0,
      };
    })
    .sort((first, second) => second.sentPerSecond - first.sentPerSecond || first.client.name.localeCompare(second.client.name));
}

function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

export function fit(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  let visible = 0;
  let result = '';
  for (let index = 0; index < text.length && visible < width; index++) {
    const rest = text.slice(index);
    const escape = rest.match(new RegExp(`^${ESC.replace('[', '\\[')}[0-9;]*m`));
    if (escape) {
      result += escape[0];
      index += escape[0].length - 1;
      continue;
    }
    result += text[index];
    visible++;
  }
  return `${result}${Style.Reset}`;
}

function cell(text: string, width: number, right = false): string {
  const cut = text.length > width ? `${text.slice(0, width - 1)}…` : text;
  return right ? cut.padStart(width) : cut.padEnd(width);
}

function header(input: ViewInput, current: MonitorSnapshot | undefined): string {
  const uptime = current ? `up ${formatDuration(current.uptimeSeconds)}` : '';
  return `${Style.Bold}${Style.Cyan}Boxhead server monitor${Style.Reset}  ${input.url}  ${uptime}   ${Style.Dim}q quit${Style.Reset}`;
}

function systemLines(previous: MonitorSnapshot | undefined, current: MonitorSnapshot): string[] {
  const cpu = cpuPercent(previous, current);
  const { memory, eventLoopDelayMs: delay, traffic } = current;
  const seconds = previous ? elapsedSeconds(previous, current) : 1;
  const sent = previous ? rate(previous.traffic.bytesSent, traffic.bytesSent, seconds) : 0;
  const received = previous ? rate(previous.traffic.bytesReceived, traffic.bytesReceived, seconds) : 0;
  const usedSystem = memory.systemTotal - memory.systemFree;
  const load = current.loadAverage.map((value) => value.toFixed(LOAD_DIGITS)).join(' ');
  return [
    `${Style.Bold}CPU ${Style.Reset} ${bar(cpu / PERCENT)} ${cpu.toFixed(1).padStart(6)}% of one core (${current.cpu.cores} cores)   load ${load}`,
    `${Style.Bold}MEM ${Style.Reset} ${bar(memory.rss / memory.systemTotal)} RSS ${formatBytes(memory.rss)}   heap ${formatBytes(memory.heapUsed)} / ${formatBytes(memory.heapTotal)}   system ${formatBytes(usedSystem)} / ${formatBytes(memory.systemTotal)}`,
    `${Style.Bold}LOOP${Style.Reset} delay mean ${delay.mean.toFixed(DELAY_DIGITS)} ms   p99 ${delay.p99.toFixed(DELAY_DIGITS)} ms   max ${delay.max.toFixed(DELAY_DIGITS)} ms`,
    `${Style.Bold}NET ${Style.Reset} ${Style.Green}↑ ${formatRate(sent)}${Style.Reset}   ${Style.Cyan}↓ ${formatRate(received)}${Style.Reset}   total ↑ ${formatBytes(traffic.bytesSent)}  ↓ ${formatBytes(traffic.bytesReceived)}`,
  ];
}

function lobbyLines(current: MonitorSnapshot, rows: number): string[] {
  const title = `${Style.Inverse}${cell('LOBBY', LOBBY_WIDTH)} ${cell('MODE', MODE_WIDTH)} ${cell('STATE', STATE_WIDTH)} ${cell('PLAYERS', SMALL_NUMBER_WIDTH, true)} ${cell('TICK', NUMBER_WIDTH, true)}${Style.Reset}`;
  const lines = current.lobbies.slice(0, rows).map((lobby) => {
    const tick = lobby.tickMs === null ? '-' : `${lobby.tickMs.toFixed(DELAY_DIGITS)} ms`;
    const color = lobby.tickMs === null ? '' : levelColor(lobby.tickMs / TICK_BUDGET_MS);
    return `${cell(lobby.name, LOBBY_WIDTH)} ${cell(lobby.mode, MODE_WIDTH)} ${cell(lobby.state, STATE_WIDTH)} ${cell(String(lobby.members), SMALL_NUMBER_WIDTH, true)} ${color}${cell(tick, NUMBER_WIDTH, true)}${Style.Reset}`;
  });
  return [`${Style.Bold}Lobbies ${current.lobbies.length}${Style.Reset}`, title, ...lines, ...more(current.lobbies.length, rows)];
}

function clientLines(previous: MonitorSnapshot | undefined, current: MonitorSnapshot, rows: number): string[] {
  const rates = clientRates(previous, current);
  const title = `${Style.Inverse}${cell('PLAYER', NAME_WIDTH)} ${cell('ACTIVITY', STATE_WIDTH)} ${cell('LOBBY', LOBBY_WIDTH)} ${cell('↑ RATE', NUMBER_WIDTH, true)} ${cell('↓ RATE', NUMBER_WIDTH, true)} ${cell('↑ TOTAL', NUMBER_WIDTH, true)} ${cell('↓ TOTAL', NUMBER_WIDTH, true)}${Style.Reset}`;
  const lines = rates.slice(0, rows).map(({ client, sentPerSecond, receivedPerSecond }) =>
    [
      cell(client.name, NAME_WIDTH),
      cell(client.activity, STATE_WIDTH),
      cell(client.lobby ?? '-', LOBBY_WIDTH),
      cell(formatRate(sentPerSecond), NUMBER_WIDTH, true),
      cell(formatRate(receivedPerSecond), NUMBER_WIDTH, true),
      cell(formatBytes(client.bytesSent), NUMBER_WIDTH, true),
      cell(formatBytes(client.bytesReceived), NUMBER_WIDTH, true),
    ].join(' '),
  );
  return [`${Style.Bold}Players ${current.clients.length}${Style.Reset}`, title, ...lines, ...more(rates.length, rows)];
}

function more(total: number, shown: number): string[] {
  return total > shown ? [`${Style.Dim}+${total - shown} more${Style.Reset}`] : [];
}

export function renderView(input: ViewInput): string[] {
  const { current, previous } = input;
  const lines = [header(input, current)];
  if (input.error) lines.push(`${Style.Red}${input.error}${Style.Reset}`);
  if (current) {
    lines.push(...systemLines(previous, current), '');
    const tableRows = Math.max(MIN_TABLE_ROWS, input.height - HEADER_ROWS);
    const lobbyRows = Math.min(current.lobbies.length, Math.max(MIN_TABLE_ROWS, Math.floor(tableRows / LOBBY_SHARE)));
    lines.push(...lobbyLines(current, lobbyRows), '');
    lines.push(...clientLines(previous, current, Math.max(MIN_TABLE_ROWS, input.height - lines.length - TABLE_CHROME_ROWS)));
  } else if (!input.error) {
    lines.push(`${Style.Dim}Waiting for the first sample…${Style.Reset}`);
  }
  return lines.slice(0, input.height).map((line) => fit(line, input.width));
}
