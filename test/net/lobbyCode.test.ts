import { describe, expect, it } from 'vitest';
import { lobbyCodeFromNumber, lobbyCodeFromUrl, lobbyLinkUrl, normalizeLobbyCode } from '../../src/net/lobbyCode.ts';

describe('lobby codes', () => {
  it('builds 5 character codes without look-alike characters', () => {
    expect(lobbyCodeFromNumber(0)).toBe('AAAAA');
    expect(lobbyCodeFromNumber(123456789)).toMatch(/^[A-HJKMNP-Z2-9]{5}$/);
    expect(lobbyCodeFromNumber(1)).not.toBe(lobbyCodeFromNumber(2));
  });

  it('upper-cases typed codes and drops other characters', () => {
    expect(normalizeLobbyCode(' y5q-3u ')).toBe('Y5Q3U');
    expect(normalizeLobbyCode('abcdefgh')).toBe('ABCDE');
  });

  it('reads the code from a game link and ignores incomplete codes', () => {
    expect(lobbyCodeFromUrl('http://localhost:5199/?code=y5q3u')).toBe('Y5Q3U');
    expect(lobbyCodeFromUrl('http://localhost:5199/?code=Y5Q')).toBeUndefined();
    expect(lobbyCodeFromUrl('http://localhost:5199/')).toBeUndefined();
  });

  it('adds, replaces and removes the code while keeping other query values', () => {
    expect(lobbyLinkUrl('http://host/game/?debug=1', 'Y5Q3U')).toBe('http://host/game/?debug=1&code=Y5Q3U');
    expect(lobbyLinkUrl('http://host/?code=AAAAA', 'Y5Q3U')).toBe('http://host/?code=Y5Q3U');
    expect(lobbyLinkUrl('http://host/?code=Y5Q3U', undefined)).toBe('http://host/');
  });
});
