import { MAX_PLAYERS } from '../domain/world/tuning.ts';

export const PROTOCOL_VERSION = 5;
export const SOCKET_PATH = '/ws';

export const PLAYER_NAME_MAX_LENGTH = 16;
export const RAW_NAME_MAX_LENGTH = 64;
export const LOBBY_ID_MAX_LENGTH = 64;
export const SESSION_ID_MAX_LENGTH = 64;
export const ROOM_ID_MAX_LENGTH = 64;

export const MAX_LOBBY_PLAYERS = MAX_PLAYERS;
export const LOBBY_CODE_LENGTH = 5;
export const LOBBY_CODE_PARAM = 'code';
export const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const FRACTION_DIGITS_SCALE = 1000;
export const WIRE_KEYED_FIELD = 'thingKey';
export const WIRE_MAX_INTERNED_LENGTH = 64;
export const WIRE_STRING_TABLE_LIMIT = 4096;
