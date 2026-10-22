export interface Rng {
  next(): number;
  int(exclusiveMax: number): number;
}

const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_OR_A = 1;
const MULBERRY_OR_B = 61;
const UINT32_RANGE = 4294967296;

export class SeededRng implements Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + MULBERRY_INCREMENT) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> MULBERRY_SHIFT_A), t | MULBERRY_OR_A);
    t ^= t + Math.imul(t ^ (t >>> MULBERRY_SHIFT_B), t | MULBERRY_OR_B);
    return ((t ^ (t >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_RANGE;
  }

  int(exclusiveMax: number): number {
    if (exclusiveMax <= 0) return 0;
    return Math.floor(this.next() * exclusiveMax);
  }
}

export class SequenceRng implements Rng {
  private index = 0;

  constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[this.index % this.values.length] ?? 0;
    this.index++;
    return value;
  }

  int(exclusiveMax: number): number {
    if (exclusiveMax <= 0) return 0;
    return Math.floor(this.next() * exclusiveMax);
  }
}
