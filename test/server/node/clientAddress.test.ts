import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { addressKey, clientAddress, lastForwardedAddress, UNKNOWN_ADDRESS } from '../../../src/server/node/clientAddress.ts';

const PROXY = '10.0.0.2';

function request(forwardedFor: string | undefined, remoteAddress: string | null = PROXY): IncomingMessage {
  const headers = forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor };
  return { headers, socket: { remoteAddress: remoteAddress ?? undefined } } as unknown as IncomingMessage;
}

describe('client address', () => {
  it('uses the socket address and ignores X-Forwarded-For without a trusted proxy', () => {
    expect(clientAddress(request('203.0.113.9'), false)).toBe(PROXY);
  });

  it('uses the rightmost X-Forwarded-For entry behind a trusted proxy and ignores spoofed entries on its left', () => {
    expect(clientAddress(request('203.0.113.9'), true)).toBe('203.0.113.9');
    expect(clientAddress(request('1.1.1.1, 2.2.2.2 , 203.0.113.9'), true)).toBe('203.0.113.9');
  });

  it('falls back to the socket address when the trusted header is missing or not an address', () => {
    expect(clientAddress(request(undefined), true)).toBe(PROXY);
    expect(clientAddress(request('203.0.113.9, nonsense'), true)).toBe(PROXY);
    expect(clientAddress(request('203.0.113.9,'), true)).toBe(PROXY);
    expect(clientAddress(request(undefined, null), true)).toBe(UNKNOWN_ADDRESS);
  });

  it('joins repeated header values before taking the last entry', () => {
    expect(lastForwardedAddress(['1.1.1.1', '203.0.113.9'])).toBe('203.0.113.9');
  });

  it('keys IPv4-mapped IPv6 as IPv4 and IPv6 by its /64 network', () => {
    expect(addressKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(addressKey('2001:db8:0:1:aaaa::1')).toBe('2001:db8:0:1::/64');
    expect(addressKey('2001:DB8:0000:0001:ffff:1:2:3')).toBe('2001:db8:0:1::/64');
    expect(addressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(addressKey('::1')).toBe('0:0:0:0::/64');
    expect(addressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(addressKey('64:ff9b::192.0.2.1')).toBe('64:ff9b:0:0::/64');
  });
});
