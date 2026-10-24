import { LATENCY_MAX_PENDING, LATENCY_SMOOTHING } from './tuning.ts';

interface PendingPing {
  readonly id: number;
  readonly sentAt: number;
}

export class LatencyMeter {
  private smoothed: number | undefined = undefined;
  private pending: PendingPing[] = [];
  private nextId = 0;

  sent(sentAt: number): number {
    const id = this.nextId++;
    this.pending.push({ id, sentAt });
    if (this.pending.length > LATENCY_MAX_PENDING) this.pending.shift();
    return id;
  }

  answered(id: number, now: number): void {
    const ping = this.pending.find((pending) => pending.id === id);
    if (!ping) return;
    this.pending = this.pending.filter((pending) => pending.id > id);
    const roundTrip = now - ping.sentAt;
    this.smoothed = this.smoothed === undefined ? roundTrip : this.smoothed + (roundTrip - this.smoothed) * LATENCY_SMOOTHING;
  }

  latencyMs(now: number): number | undefined {
    if (this.smoothed === undefined) return undefined;
    const oldest = this.pending[0];
    const waiting = oldest === undefined ? 0 : now - oldest.sentAt;
    return Math.round(Math.max(this.smoothed, waiting));
  }

  reset(): void {
    this.smoothed = undefined;
    this.pending = [];
  }
}
