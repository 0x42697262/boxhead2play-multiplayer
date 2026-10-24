import { describe, expect, it } from 'vitest';
import { loadServerSettings, ServerConfigError, UNLIMITED } from '../../src/config/serverEnv.ts';

describe('server settings', () => {
  it('defaults to per-address limits and an untrusted proxy header', () => {
    const settings = loadServerSettings({});
    expect(settings.addressLimits).toEqual({ socketsPerAddress: 16, sessionsPerAddress: 8, lobbiesPerAddress: 4 });
    expect(settings.trustProxy).toBe(false);
    expect(Object.isFrozen(settings.addressLimits)).toBe(true);
  });

  it('reads the limits and the proxy switch from the environment, with 0 as unlimited', () => {
    const settings = loadServerSettings({
      BOXHEAD_MAX_SOCKETS_PER_ADDRESS: '0',
      BOXHEAD_MAX_SESSIONS_PER_ADDRESS: '3',
      BOXHEAD_MAX_LOBBIES_PER_ADDRESS: '2',
      BOXHEAD_TRUST_PROXY: 'true',
    });
    expect(settings.addressLimits).toEqual({ socketsPerAddress: UNLIMITED, sessionsPerAddress: 3, lobbiesPerAddress: 2 });
    expect(settings.trustProxy).toBe(true);
  });

  it.each([
    ['BOXHEAD_MAX_SESSIONS_PER_ADDRESS', '-1'],
    ['BOXHEAD_MAX_LOBBIES_PER_ADDRESS', '1.5'],
    ['BOXHEAD_MAX_SOCKETS_PER_ADDRESS', 'many'],
    ['BOXHEAD_TRUST_PROXY', 'yes'],
  ])('refuses %s=%s at boot', (name, value) => {
    expect(() => loadServerSettings({ [name]: value })).toThrow(ServerConfigError);
  });
});
