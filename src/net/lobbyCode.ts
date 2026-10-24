import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH } from './tuning.ts';

export function lobbyCodeFromNumber(value: number): string {
  const base = LOBBY_CODE_ALPHABET.length;
  let rest = Math.abs(Math.trunc(value));
  let code = '';
  for (let index = 0; index < LOBBY_CODE_LENGTH; index++) {
    code += LOBBY_CODE_ALPHABET[rest % base] ?? '';
    rest = Math.floor(rest / base);
  }
  return code;
}

export function normalizeLobbyCode(typed: string): string {
  return [...typed.toUpperCase()].filter((character) => LOBBY_CODE_ALPHABET.includes(character)).join('').slice(0, LOBBY_CODE_LENGTH);
}
