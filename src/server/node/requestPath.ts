const REQUEST_BASE = 'http://localhost';

export function requestPathname(url: string | undefined): string | undefined {
  try {
    return new URL(url ?? '', REQUEST_BASE).pathname;
  } catch {
    return undefined;
  }
}
