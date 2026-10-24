const LANDSCAPE = 'landscape';

type LockableOrientation = object;

function lockOf(orientation: LockableOrientation | undefined): ((orientation: string) => Promise<void>) | undefined {
  const lock: unknown = orientation && 'lock' in orientation ? orientation.lock : undefined;
  return typeof lock === 'function' ? (value: string) => (lock as (value: string) => Promise<void>).call(orientation, value) : undefined;
}

export interface FullscreenHost {
  readonly fullscreenEnabled: boolean;
  readonly fullscreenElement: Element | null;
  readonly documentElement: { requestFullscreen(options?: FullscreenOptions): Promise<void> };
}

export function needsFullscreen(host: FullscreenHost): boolean {
  return host.fullscreenEnabled && host.fullscreenElement === null;
}

export async function enterLandscapeFullscreen(host: FullscreenHost, orientation: LockableOrientation | undefined): Promise<boolean> {
  if (!needsFullscreen(host)) return false;
  try {
    await host.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    return false;
  }
  await lockOf(orientation)?.(LANDSCAPE).catch(() => undefined);
  return true;
}

export function isHomeScreenCandidate(navigator: Navigator, fullscreenEnabled: boolean): boolean {
  const standalone = (navigator as Navigator & { readonly standalone?: boolean }).standalone;
  return standalone === false && !fullscreenEnabled;
}
