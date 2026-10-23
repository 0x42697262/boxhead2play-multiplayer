const SEPARATOR = '/';

export function directoryOf(path: string): string {
  const index = path.lastIndexOf(SEPARATOR);
  return index < 0 ? '' : path.slice(0, index + 1);
}

export function joinUrl(base: string, path: string): string {
  if (base === '') return path;
  return base.endsWith(SEPARATOR) ? `${base}${path}` : `${base}${SEPARATOR}${path}`;
}

export function catalogEntryUrl(assetBaseUrl: string, catalogPath: string, entryPath: string): string {
  return joinUrl(assetBaseUrl, `${directoryOf(catalogPath)}${entryPath}`);
}
