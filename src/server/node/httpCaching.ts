export const CachePolicy = {
  Immutable: 'public, max-age=31536000, immutable',
  Revalidate: 'no-cache',
} as const;

export const ContentEncoding = {
  Brotli: 'br',
  Gzip: 'gzip',
} as const;

export type ContentEncoding = (typeof ContentEncoding)[keyof typeof ContentEncoding];

const ENCODING_PREFERENCE: readonly ContentEncoding[] = [ContentEncoding.Brotli, ContentEncoding.Gzip];
const HASHED_BUNDLE = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:js|css)(?:\.map)?$/;
const LIST_SEPARATOR = ',';
const PARAMETER_SEPARATOR = ';';
const QUALITY_PREFIX = 'q=';
const WILDCARD = '*';
const WEAK_PREFIX = 'W/';

export function isHashedBundle(relativePath: string): boolean {
  return HASHED_BUNDLE.test(relativePath);
}

function acceptedCodings(header: string): Map<string, number> {
  const accepted = new Map<string, number>();
  for (const part of header.split(LIST_SEPARATOR)) {
    const [name = '', ...parameters] = part.trim().toLowerCase().split(PARAMETER_SEPARATOR);
    const qualityParameter = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter.startsWith(QUALITY_PREFIX));
    const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice(QUALITY_PREFIX.length));
    if (name !== '') accepted.set(name.trim(), Number.isFinite(quality) ? quality : 0);
  }
  return accepted;
}

export function chooseEncoding(header: string | undefined, available: readonly ContentEncoding[]): ContentEncoding | undefined {
  if (header === undefined || available.length === 0) return undefined;
  const accepted = acceptedCodings(header);
  const wildcard = accepted.get(WILDCARD);
  return ENCODING_PREFERENCE.find((encoding) => {
    if (!available.includes(encoding)) return false;
    const quality = accepted.get(encoding) ?? wildcard ?? 0;
    return quality > 0;
  });
}

function opaqueTag(tag: string): string {
  const trimmed = tag.trim();
  return trimmed.startsWith(WEAK_PREFIX) ? trimmed.slice(WEAK_PREFIX.length) : trimmed;
}

export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (ifNoneMatch === undefined) return false;
  if (ifNoneMatch.trim() === WILDCARD) return true;
  const wanted = opaqueTag(etag);
  return ifNoneMatch.split(LIST_SEPARATOR).some((tag) => opaqueTag(tag) === wanted);
}
