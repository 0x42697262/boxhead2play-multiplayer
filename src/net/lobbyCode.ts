import { LOBBY_CODE_ALPHABET, LOBBY_CODE_LENGTH, LOBBY_CODE_PARAM } from './tuning.ts';

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

export function lobbyCodeFromUrl(href: string): string | undefined {
  const raw = new URL(href).searchParams.get(LOBBY_CODE_PARAM);
  const code = raw === null ? '' : normalizeLobbyCode(raw);
  return code.length === LOBBY_CODE_LENGTH ? code : undefined;
}

export function lobbyLinkUrl(href: string, code: string | undefined): string {
  const url = new URL(href);
  if (code === undefined) url.searchParams.delete(LOBBY_CODE_PARAM);
  else url.searchParams.set(LOBBY_CODE_PARAM, code);
  return url.toString();
}
