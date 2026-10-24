import type { IncomingMessage } from 'node:http';
import { isIP, isIPv4, isIPv6 } from 'node:net';

const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const LIST_SEPARATOR = ',';
const GROUP_SEPARATOR = ':';
const COMPRESSED_GROUPS = '::';
const ZONE_SEPARATOR = '%';
const MAPPED_IPV4_PREFIX = '::ffff:';
const IPV6_GROUPS = 8;
const IPV4_GROUPS_IN_IPV6 = 2;
const IPV6_NETWORK_GROUPS = 4;
const HEX_RADIX = 16;
const IPV6_NETWORK_SUFFIX = '::/64';
export const UNKNOWN_ADDRESS = 'unknown';

export function lastForwardedAddress(header: string | readonly string[] | undefined): string | undefined {
  const list = typeof header === 'string' ? header : header?.join(LIST_SEPARATOR);
  const last = list?.split(LIST_SEPARATOR).at(-1)?.trim();
  return last !== undefined && isIP(last) !== 0 ? last : undefined;
}

function groupCount(part: string): number {
  if (part === '') return 0;
  return part.split(GROUP_SEPARATOR).reduce((count, group) => count + (isIPv4(group) ? IPV4_GROUPS_IN_IPV6 : 1), 0);
}

function ipv6Network(address: string): string {
  const [head = '', tail] = address.split(COMPRESSED_GROUPS);
  const headGroups = head === '' ? [] : head.split(GROUP_SEPARATOR);
  const missing = tail === undefined ? 0 : IPV6_GROUPS - headGroups.length - groupCount(tail);
  const groups = [...headGroups, ...Array<string>(missing).fill('0'), ...(tail === undefined || tail === '' ? [] : tail.split(GROUP_SEPARATOR))];
  const network = groups.slice(0, IPV6_NETWORK_GROUPS).map((group) => Number.parseInt(group, HEX_RADIX).toString(HEX_RADIX));
  return `${network.join(GROUP_SEPARATOR)}${IPV6_NETWORK_SUFFIX}`;
}

export function addressKey(address: string): string {
  const lower = address.toLowerCase().split(ZONE_SEPARATOR)[0] ?? '';
  if (lower.startsWith(MAPPED_IPV4_PREFIX) && isIPv4(lower.slice(MAPPED_IPV4_PREFIX.length))) return lower.slice(MAPPED_IPV4_PREFIX.length);
  return isIPv6(lower) ? ipv6Network(lower) : lower;
}

export function clientAddress(request: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy ? lastForwardedAddress(request.headers[FORWARDED_FOR_HEADER]) : undefined;
  const address = forwarded ?? request.socket.remoteAddress;
  return address === undefined ? UNKNOWN_ADDRESS : addressKey(address);
}
