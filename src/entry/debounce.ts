export interface DelayTimers {
  start(run: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

export function debounce(run: () => void, delayMs: number, timers: DelayTimers): () => void {
  let pending: number | undefined = undefined;
  return () => {
    if (pending !== undefined) timers.cancel(pending);
    pending = timers.start(() => {
      pending = undefined;
      run();
    }, delayMs);
  };
}
