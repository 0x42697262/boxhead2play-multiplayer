import { UNLIMITED } from '../config/serverEnv.ts';

export class AddressCounts {
  private readonly counts = new Map<string, number>();
  private sum = 0;

  get total(): number {
    return this.sum;
  }

  count(address: string): number {
    return this.counts.get(address) ?? 0;
  }

  reached(address: string, limit: number): boolean {
    return limit !== UNLIMITED && this.count(address) >= limit;
  }

  add(address: string): void {
    this.counts.set(address, this.count(address) + 1);
    this.sum++;
  }

  remove(address: string): void {
    const left = this.count(address) - 1;
    if (left > 0) this.counts.set(address, left);
    else this.counts.delete(address);
    this.sum--;
  }

  clear(): void {
    this.counts.clear();
    this.sum = 0;
  }
}
