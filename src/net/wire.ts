import { FRACTION_DIGITS_SCALE as WIRE_FIXED_SCALE, WIRE_KEYED_FIELD, WIRE_MAX_INTERNED_LENGTH, WIRE_STRING_TABLE_LIMIT } from './tuning.ts';

const Tag = {
  Same: 0,
  Null: 1,
  False: 2,
  True: 3,
  Int: 4,
  IntDelta: 5,
  Fixed: 6,
  FixedDelta: 7,
  Float: 8,
  String: 9,
  Array: 10,
  Object: 11,
  Keyed: 12,
} as const;

const StringSlot = {
  New: 0,
  Raw: 1,
  FirstId: 2,
} as const;

const VARINT_BITS = 128;
const INITIAL_CAPACITY = 1024;
const FLOAT_BYTES = 8;
const LITTLE_ENDIAN = true;

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type JsonObject = { readonly [key: string]: Json };

export class WireError extends Error {}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function zigzag(value: number): number {
  return value >= 0 ? value * 2 : -value * 2 - 1;
}

function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
}

function varintSize(value: number): number {
  let size = 1;
  for (let rest = value; rest >= VARINT_BITS; rest = Math.floor(rest / VARINT_BITS)) size++;
  return size;
}

function fixedOf(value: number): number {
  return Math.round(value * WIRE_FIXED_SCALE);
}

function keyedField(value: Json): string | undefined {
  if (!isObject(value)) return undefined;
  const key = value[WIRE_KEYED_FIELD];
  return typeof key === 'string' ? key : undefined;
}

function isKeyedArray(value: readonly Json[]): boolean {
  return value.length > 0 && value.every((item) => keyedField(item) !== undefined);
}

function keyedBaseline(baseline: Json | undefined): Map<string, Json> {
  const byKey = new Map<string, Json>();
  if (!Array.isArray(baseline)) return byKey;
  for (const item of baseline as readonly Json[]) {
    const key = keyedField(item);
    if (key !== undefined) byKey.set(key, item);
  }
  return byKey;
}

class ByteWriter {
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

class ByteReader {
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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class WireEncoder {
  private readonly strings = new Map<string, number>();
  private readonly baselines = new Map<string, Json>();
  private writer = new ByteWriter();

  encode(message: { readonly type: string }): Uint8Array {
    this.writer = new ByteWriter();
    const baseline = this.baselines.get(message.type);
    this.string(message.type);
    const { value } = this.value(message as unknown as Json, baseline);
    this.baselines.set(message.type, value);
    return this.writer.result();
  }

  private value(raw: unknown, baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    const start = this.writer.length;
    const encoded = this.changed(raw, baseline);
    if (!encoded.same) return encoded;
    this.writer.rewind(start);
    this.writer.u8(Tag.Same);
    return encoded;
  }

  private changed(raw: unknown, baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    if (raw === null || raw === undefined || (typeof raw === 'number' && !Number.isFinite(raw))) {
      this.writer.u8(Tag.Null);
      return { value: null, same: baseline === null };
    }
    if (typeof raw === 'boolean') {
      this.writer.u8(raw ? Tag.True : Tag.False);
      return { value: raw, same: baseline === raw };
    }
    if (typeof raw === 'number') return this.number(raw, baseline);
    if (typeof raw === 'string') {
      this.writer.u8(Tag.String);
      this.string(raw);
      return { value: raw, same: baseline === raw };
    }
    if (Array.isArray(raw)) return this.array(raw as readonly unknown[], baseline);
    if (typeof raw === 'object') return this.object(raw as Readonly<Record<string, unknown>>, baseline);
    this.writer.u8(Tag.Null);
    return { value: null, same: baseline === null };
  }

  private number(raw: number, baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    const integer = Number.isInteger(raw);
    const fixed = fixedOf(raw);
    const value = integer ? raw : fixed / WIRE_FIXED_SCALE;
    const same = baseline === value;
    if (!Number.isSafeInteger(integer ? raw : fixed)) {
      this.writer.u8(Tag.Float);
      this.writer.float(raw);
      return { value: raw, same: baseline === raw };
    }
    const absolute = zigzag(integer ? raw : fixed);
    const delta = typeof baseline === 'number' ? zigzag((integer ? raw : fixed) - (integer && Number.isInteger(baseline) ? baseline : fixedOf(baseline))) : undefined;
    const deltaUsable = delta !== undefined && Number.isSafeInteger(delta) && (!integer || Number.isInteger(baseline));
    if (deltaUsable && varintSize(delta) < varintSize(absolute)) {
      this.writer.u8(integer ? Tag.IntDelta : Tag.FixedDelta);
      this.writer.varint(delta);
    } else {
      this.writer.u8(integer ? Tag.Int : Tag.Fixed);
      this.writer.varint(absolute);
    }
    return { value, same };
  }

  private array(raw: readonly unknown[], baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    const items = raw as readonly Json[];
    if (isKeyedArray(items)) return this.keyed(items, baseline);
    const previous = Array.isArray(baseline) ? (baseline as readonly Json[]) : undefined;
    this.writer.u8(Tag.Array);
    this.writer.varint(raw.length);
    const values: Json[] = [];
    let same = previous?.length === raw.length;
    raw.forEach((item, index) => {
      const encoded = this.value(item, previous?.[index]);
      values.push(encoded.value);
      if (!encoded.same) same = false;
    });
    return same && previous ? { value: previous, same } : { value: values, same: false };
  }

  private keyed(items: readonly Json[], baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    const previous = Array.isArray(baseline) ? (baseline as readonly Json[]) : undefined;
    const byKey = keyedBaseline(baseline);
    this.writer.u8(Tag.Keyed);
    this.writer.varint(items.length);
    const values: Json[] = [];
    let same = previous?.length === items.length;
    items.forEach((item, index) => {
      const key = keyedField(item) ?? '';
      this.string(key);
      const encoded = this.value(item, byKey.get(key));
      values.push(encoded.value);
      if (!encoded.same || previous?.[index] !== encoded.value) same = false;
    });
    return same && previous ? { value: previous, same } : { value: values, same: false };
  }

  private object(raw: Readonly<Record<string, unknown>>, baseline: Json | undefined): { readonly value: Json; readonly same: boolean } {
    const previous = isObject(baseline) ? baseline : undefined;
    const entries = Object.entries(raw).filter(([, item]) => item !== undefined);
    const removed = previous ? Object.keys(previous).filter((key) => raw[key] === undefined) : [];
    this.writer.u8(Tag.Object);
    const countAt = this.writer.length;
    const values: Record<string, Json> = {};
    let changes = 0;
    const body = new ByteWriter();
    const outer = this.writer;
    this.writer = body;
    for (const [key, item] of entries) {
      const start = body.length;
      this.string(key);
      const encoded = this.value(item, previous?.[key]);
      values[key] = encoded.value;
      if (encoded.same && previous && key in previous) body.rewind(start);
      else changes++;
    }
    this.writer = outer;
    if (changes === 0 && removed.length === 0 && previous && entries.length === Object.keys(previous).length) {
      this.writer.rewind(countAt);
      return { value: previous, same: true };
    }
    this.writer.varint(changes);
    this.writer.append(body.result());
    this.writer.varint(removed.length);
    for (const key of removed) this.string(key);
    return { value: values, same: false };
  }

  private string(value: string): void {
    const id = this.strings.get(value);
    if (id !== undefined) {
      this.writer.varint(id + StringSlot.FirstId);
      return;
    }
    const internable = value.length <= WIRE_MAX_INTERNED_LENGTH && this.strings.size < WIRE_STRING_TABLE_LIMIT;
    this.writer.varint(internable ? StringSlot.New : StringSlot.Raw);
    this.writer.raw(textEncoder.encode(value));
    if (internable) this.strings.set(value, this.strings.size);
  }
}

export class WireDecoder {
  private readonly strings: string[] = [];
  private readonly baselines = new Map<string, Json>();

  decode(bytes: Uint8Array): unknown {
    const reader = new ByteReader(bytes);
    const type = this.string(reader);
    const value = this.value(reader, this.baselines.get(type));
    if (!reader.done) throw new WireError('trailing bytes');
    this.baselines.set(type, value);
    return value;
  }

  private value(reader: ByteReader, baseline: Json | undefined): Json {
    return this.valueAfterTag(reader, reader.u8(), baseline);
  }

  private valueAfterTag(reader: ByteReader, tag: number, baseline: Json | undefined): Json {
    switch (tag) {
      case Tag.Same:
        if (baseline === undefined) throw new WireError('same without baseline');
        return baseline;
      case Tag.Null:
        return null;
      case Tag.False:
        return false;
      case Tag.True:
        return true;
      case Tag.Int:
        return unzigzag(reader.varint());
      case Tag.IntDelta:
        return this.numberBaseline(baseline) + unzigzag(reader.varint());
      case Tag.Fixed:
        return unzigzag(reader.varint()) / WIRE_FIXED_SCALE;
      case Tag.FixedDelta:
        return (fixedOf(this.numberBaseline(baseline)) + unzigzag(reader.varint())) / WIRE_FIXED_SCALE;
      case Tag.Float:
        return reader.float();
      case Tag.String:
        return this.string(reader);
      case Tag.Array:
        return this.array(reader, baseline);
      case Tag.Keyed:
        return this.keyed(reader, baseline);
      case Tag.Object:
        return this.object(reader, baseline);
      default:
        throw new WireError(`unknown tag ${tag}`);
    }
  }

  private numberBaseline(baseline: Json | undefined): number {
    if (typeof baseline !== 'number') throw new WireError('delta without number');
    return baseline;
  }

  private array(reader: ByteReader, baseline: Json | undefined): Json {
    const previous = Array.isArray(baseline) ? (baseline as readonly Json[]) : undefined;
    const length = this.count(reader);
    const values: Json[] = [];
    for (let index = 0; index < length; index++) values.push(this.value(reader, previous?.[index]));
    return values;
  }

  private keyed(reader: ByteReader, baseline: Json | undefined): Json {
    const byKey = keyedBaseline(baseline);
    const length = this.count(reader);
    const values: Json[] = [];
    for (let index = 0; index < length; index++) {
      const key = this.string(reader);
      values.push(this.value(reader, byKey.get(key)));
    }
    return values;
  }

  private object(reader: ByteReader, baseline: Json | undefined): Json {
    const previous = isObject(baseline) ? baseline : {};
    const changed = new Map<string, Json>();
    const changes = this.count(reader);
    for (let index = 0; index < changes; index++) {
      const key = this.string(reader);
      changed.set(key, this.value(reader, previous[key]));
    }
    const removed = new Set<string>();
    const removals = this.count(reader);
    for (let index = 0; index < removals; index++) removed.add(this.string(reader));
    const kept = Object.entries(previous).filter(([key]) => !removed.has(key) && !changed.has(key));
    return Object.fromEntries([...kept, ...changed]);
  }

  private count(reader: ByteReader): number {
    const count = reader.varint();
    if (count > reader.remaining) throw new WireError('count too large');
    return count;
  }

  private string(reader: ByteReader): string {
    const slot = reader.varint();
    if (slot === StringSlot.New) {
      if (this.strings.length >= WIRE_STRING_TABLE_LIMIT) throw new WireError('string table full');
      const value = textDecoder.decode(reader.raw());
      this.strings.push(value);
      return value;
    }
    if (slot === StringSlot.Raw) return textDecoder.decode(reader.raw());
    const value = this.strings[slot - StringSlot.FirstId];
    if (value === undefined) throw new WireError('unknown string');
    return value;
  }
}
