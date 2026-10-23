import { PLAYER_NAME_MAX_LENGTH } from '../net/tuning.ts';
import { DEFAULT_PLAYER_NAME, LOBBY_NAME_SUFFIX } from './tuning.ts';

const CONTROL_CHARACTERS = /\p{Cc}/gu;

export function sanitizeName(name: string): string {
  const clean = name.replace(CONTROL_CHARACTERS, '').trim().slice(0, PLAYER_NAME_MAX_LENGTH);
  return clean || DEFAULT_PLAYER_NAME;
}

export function lobbyName(hostName: string): string {
  return `${hostName.slice(0, PLAYER_NAME_MAX_LENGTH - LOBBY_NAME_SUFFIX.length)}${LOBBY_NAME_SUFFIX}`;
}
