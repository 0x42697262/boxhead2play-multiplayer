import { MS_PER_SECOND } from './tuning.ts';

export function secondsSince(startMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - startMs) / MS_PER_SECOND);
}
