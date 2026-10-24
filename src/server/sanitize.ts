import { PLAYER_NAME_MAX_LENGTH } from '../net/tuning.ts';
import { DEFAULT_PLAYER_NAME, DUPLICATE_NAME_MARK, FIRST_DUPLICATE_NUMBER, LOBBY_NAME_SUFFIX } from './tuning.ts';

const CONTROL_CHARACTERS = /\p{Cc}/gu;

export function sanitizeName(name: string): string {
  const clean = name.replace(CONTROL_CHARACTERS, '').trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return clean || DEFAULT_PLAYER_NAME;
}

export function nameKey(name: string): string {
  return name.toLowerCase();
}

export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(nameKey(name))) return name;
  for (let number = FIRST_DUPLICATE_NUMBER; ; number++) {
    const suffix = `${DUPLICATE_NAME_MARK}${number}`;
    const candidate = `${name.slice(0, PLAYER_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

export function lobbyName(hostName: string): string {
  return `${hostName.slice(0, PLAYER_NAME_MAX_LENGTH - LOBBY_NAME_SUFFIX.length)}${LOBBY_NAME_SUFFIX}`;
}
