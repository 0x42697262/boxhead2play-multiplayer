import { FRACTION_DIGITS_SCALE } from './tuning.ts';

export const VARINT_BITS = 128;
const INITIAL_CAPACITY = 1024;
const FLOAT_BYTES = 8;
const LITTLE_ENDIAN = true;

export class WireError extends Error {}

export function zigzag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

export function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

export function varintSize(value: number): number {
  let size = 1;
  for (let rest = value; rest >= VARINT_BITS; rest = Math.floor(rest / VARINT_BITS)) size++;
  return size;
}

export function fixedOf(value: number): number {
  return Math.round(value * FRACTION_DIGITS_SCALE);
}

export function fromFixed(fixed: number): number {
  return fixed / FRACTION_DIGITS_SCALE;
}

export class ByteWriter {
  private bytes = new Uint8Array(INITIAL_CAPACITY);
  private view = new DataView(this.bytes.buffer);
  length = 0;

  u8(value: number): void {
    this.reserve(1);
    this.bytes[this.length++] = value;
  }

  varint(value: number): void {
    let rest = value;
    while (rest >= VARINT_BITS) {
      this.u8((rest % VARINT_BITS) | VARINT_BITS);
      rest = Math.floor(rest / VARINT_BITS);
    }
    this.u8(rest);
  }

  float(value: number): void {
    this.reserve(FLOAT_BYTES);
    this.view.setFloat64(this.length, value, LITTLE_ENDIAN);
    this.length += FLOAT_BYTES;
  }

  raw(bytes: Uint8Array): void {
    this.varint(bytes.length);
    this.reserve(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  append(bytes: Uint8Array): void {
    this.reserve(bytes.length);
    this.bytes.set(bytes, this.length);
    this.length += bytes.length;
  }

  rewind(length: number): void {
    this.length = length;
  }

  result(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }

  appendWriter(other: ByteWriter): void {
    this.append(other.bytes.subarray(0, other.length));
  }

  private reserve(extra: number): void {
    if (this.length + extra <= this.bytes.length) return;
    let capacity = this.bytes.length * 2;
    while (capacity < this.length + extra) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.bytes.subarray(0, this.length));
    this.bytes = grown;
    this.view = new DataView(grown.buffer);
  }
}

export class ByteReader {
  private offset = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get done(): boolean {
    return this.offset === this.bytes.length;
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  u8(): number {
    const value = this.bytes[this.offset++];
    if (value === undefined) throw new WireError('truncated');
    return value;
  }

  varint(): number {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.u8();
      value += (byte % VARINT_BITS) * scale;
      if (byte < VARINT_BITS) return value;
      scale *= VARINT_BITS;
      if (scale > Number.MAX_SAFE_INTEGER) throw new WireError('varint too long');
    }
  }

  float(): number {
    if (this.offset + FLOAT_BYTES > this.bytes.length) throw new WireError('truncated');
    const value = this.view.getFloat64(this.offset, LITTLE_ENDIAN);
    this.offset += FLOAT_BYTES;
    return value;
  }

  raw(): Uint8Array {
    const length = this.varint();
    if (this.offset + length > this.bytes.length) throw new WireError('truncated');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}
