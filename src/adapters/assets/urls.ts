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

export const VERSION_PARAM = 'v';
export const VERSION_LENGTH = 16;

export interface VersionedFile {
  readonly path: string;
  readonly sha256: string;
}

export function contentVersion(sha256: string): string {
  return sha256.slice(0, VERSION_LENGTH);
}

export class AssetLocator {
  private readonly versions: ReadonlyMap<string, string>;

  constructor(
    readonly baseUrl: string,
    files: readonly VersionedFile[] = [],
  ) {
    this.versions = new Map(files.map((file) => [file.path, contentVersion(file.sha256)]));
  }

  url(relativePath: string): string {
    const url = joinUrl(this.baseUrl, relativePath);
    const version = this.versions.get(relativePath);
    return version === undefined ? url : `${url}?${VERSION_PARAM}=${version}`;
  }

  entryUrl(catalogPath: string, entryPath: string): string {
    return this.url(`${directoryOf(catalogPath)}${entryPath}`);
  }
}
