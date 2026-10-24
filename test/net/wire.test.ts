import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/domain/math/Rng.ts';
import { FRACTION_DIGITS_SCALE, WIRE_KEYED_FIELD, WIRE_MAX_INTERNED_LENGTH, WIRE_STRING_TABLE_LIMIT } from '../../src/net/tuning.ts';
import { WireDecoder, WireEncoder, WireError } from '../../src/net/wire.ts';

type Message = { readonly type: string; readonly [key: string]: unknown };

function pair(resetTypes: ReadonlySet<string> = new Set()): { send: (message: Message) => { bytes: number; decoded: unknown } } {
  const encoder = new WireEncoder(resetTypes);
  const decoder = new WireDecoder();
  return {
    send(message) {
      const bytes = encoder.encode(message);
      return { bytes: bytes.length, decoded: decoder.decode(bytes) };
    },
  };
}

function entry(key: string, x: number, frame = 0): Message {
  return { type: 'entry', thingKey: key, position: { x, y: 4.5, z: 0 }, visual: { kind: 'character', animation: 'Zombie_Walk', frame } };
}

describe('wire codec', () => {
  it('round-trips values the way JSON does, with numbers rounded to 3 decimals', () => {
    const { send } = pair();
    const message = {
      type: 'frame',
      ints: [0, 1, -1, 300, -70000, 2 ** 40],
      fractions: [0.1234, -62.2845, 1e-4],
      huge: 2 ** 60,
      notFinite: Number.NaN,
      flags: [true, false, null],
      dropped: undefined,
      text: 'Pistol selected!',
      long: 'x'.repeat(100),
      nested: { deeper: { list: [{ a: 1 }, { b: 'two' }] } },
    };
    expect(send(message).decoded).toEqual(JSON.parse(JSON.stringify({ ...message, fractions: [0.123, -62.284, 0] })));
  });

  it('sends an unchanged message in a few bytes and only the changed parts of a changed one', () => {
    const { send } = pair();
    const frame = (x: number): Message => ({ type: 'frame', tick: 1, entries: Array.from({ length: 50 }, (_unused, index) => entry(`t${index}`, index === 7 ? x : index)) });
    const first = send(frame(7));
    const unchanged = send(frame(7));
    const moved = send(frame(7.16));
    expect(unchanged.bytes).toBeLessThanOrEqual(3);
    expect(moved.bytes).toBeLessThan(first.bytes / 10);
    expect(moved.decoded).toEqual(frame(7.16));
  });

  it('matches keyed entries by thingKey when they are reordered, added and removed', () => {
    const { send } = pair();
    send({ type: 'frame', entries: [entry('t1', 1), entry('t2', 2), entry('t3', 3)] });
    const next = { type: 'frame', entries: [entry('t3', 3), entry('t4', 4, 2), entry('t1', 1.5)] };
    expect(send(next).decoded).toEqual(next);
  });

  it('removes keys, changes array lengths and keeps separate baselines per message type', () => {
    const { send } = pair();
    send({ type: 'lobby', members: ['Ann', 'Bob'], host: 'Ann', code: 'ABCDE' });
    send({ type: 'frame', tick: 5 });
    expect(send({ type: 'lobby', members: ['Ann'], code: 'ABCDE' }).decoded).toEqual({ type: 'lobby', members: ['Ann'], code: 'ABCDE' });
    expect(send({ type: 'frame', tick: 6 }).decoded).toEqual({ type: 'frame', tick: 6 });
  });

  it('stops interning new strings at the table limit and still decodes them', () => {
    const { send } = pair();
    const names = Array.from({ length: WIRE_STRING_TABLE_LIMIT + 10 }, (_unused, index) => `name${index}`);
    expect(send({ type: 'names', names }).decoded).toEqual({ type: 'names', names });
    expect(send({ type: 'names', names: [...names].reverse() }).decoded).toEqual({ type: 'names', names: [...names].reverse() });
  });

  it('clears the string table on both sides at a reset message type and interns again after a full table', () => {
    const encoder = new WireEncoder(new Set(['start']));
    const decoder = new WireDecoder();
    const send = (message: Message): unknown => decoder.decode(encoder.encode(message));
    const names = Array.from({ length: WIRE_STRING_TABLE_LIMIT + 10 }, (_unused, index) => `name${index}`);
    send({ type: 'names', names });
    expect(encoder.stringCount).toBe(WIRE_STRING_TABLE_LIMIT);
    expect(send({ type: 'start', room: 'ROOM_Single_0001' })).toEqual({ type: 'start', room: 'ROOM_Single_0001' });
    expect(encoder.stringCount).toBe(4);
    expect(send({ type: 'names', names: names.slice(0, 2) })).toEqual({ type: 'names', names: names.slice(0, 2) });
    expect(encoder.stringCount).toBe(7);
    expect(send({ type: 'names', names: names.slice(1, 3) })).toEqual({ type: 'names', names: names.slice(1, 3) });
  });

  it('rejects a string reset anywhere but the start of a message', () => {
    const start: Message = { type: 'start', text: 'a' };
    const reset = new WireEncoder(new Set([start.type])).encode(start);
    expect(() => new WireDecoder().decode(new Uint8Array([0, 1, 97, 9, ...reset.slice(0, 1)]))).toThrow(WireError);
  });

  it('rejects truncated, unknown and out-of-range input', () => {
    const message: Message = { type: 'frame', tick: 1, text: 'hello' };
    const encoded = new WireEncoder().encode(message);
    expect(() => new WireDecoder().decode(encoded.slice(0, encoded.length - 2))).toThrow(WireError);
    expect(() => new WireDecoder().decode(new Uint8Array([0, 1, 97, 99]))).toThrow(WireError);
    expect(() => new WireDecoder().decode(new Uint8Array([9]))).toThrow(WireError);
    expect(() => new WireDecoder().decode(new Uint8Array([0, 1, 97, 10, 200, 1]))).toThrow(WireError);
    expect(() => new WireDecoder().decode(new Uint8Array([0, 1, 97, 0]))).toThrow(WireError);
    expect(() => new WireDecoder().decode(new Uint8Array([...encoded, 1]))).toThrow(WireError);
  });

  it('decodes seeded random message sequences with string resets exactly like JSON', () => {
    for (const seed of PROPERTY_SEEDS) {
      const generator = new MessageGenerator(new SeededRng(seed));
      const { send } = pair(new Set([RESET_TYPE]));
      const last = new Map<string, Message>();
      for (let step = 0; step < PROPERTY_STEPS; step++) {
        const type = generator.pick(MESSAGE_TYPES);
        const previous = last.get(type);
        const message = previous ? generator.mutateMessage(previous) : generator.message(type);
        last.set(type, message);
        expect(send(message).decoded, `seed ${seed} step ${step}`).toEqual(JSON.parse(JSON.stringify(message)));
      }
      expect(generator.uniqueStrings).toBeGreaterThan(WIRE_STRING_TABLE_LIMIT);
    }
  });
});

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const PROPERTY_SEEDS = [1, 7, 42, 2026, 65537];
const PROPERTY_STEPS = 400;
const RESET_TYPE = 'start';
const MESSAGE_TYPES = ['frame', 'lobby', 'lobbies', RESET_TYPE] as const;
const FIELD_NAMES = ['x', 'y', 'z', 'tick', 'name', 'entries', 'hud', 'list', 'flag', 'visual'] as const;
const KEY_POOL = 12;
const MAX_DEPTH = 4;
const MAX_ITEMS = 6;
const SMALL_INT = 1000;
const FRACTION_RANGE = 100000;
const UNIQUE_BATCH = 400;
const UNIQUE_BATCH_ODDS = 10;
const LARGE_NUMBERS = [2 ** 40, -(2 ** 52), 2 ** 53 + 2, -(2 ** 60), 1e300, 1e15 + 0.5, Number.MAX_SAFE_INTEGER, Number.NaN, Number.POSITIVE_INFINITY] as const;
const ValueKind = { Null: 0, Bool: 1, Int: 2, Fraction: 3, Large: 4, Text: 5, Array: 6, Keyed: 7, Object: 8 } as const;
const VALUE_KINDS = 9;
const LEAF_KINDS = 6;

class MessageGenerator {
  private unique = 0;

  constructor(private readonly rng: SeededRng) {}

  get uniqueStrings(): number {
    return this.unique;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.rng.int(items.length)];
    if (item === undefined) throw new Error('empty pick');
    return item;
  }

  message(type: string): Message {
    return { ...this.object(0), type };
  }

  mutateMessage(message: Message): Message {
    const { type, ...rest } = message;
    if (this.rng.int(UNIQUE_BATCH_ODDS) === 0) return { ...rest, type, names: this.uniqueNames() };
    return { ...(this.mutate(structuredClone(rest) as Json, 0) as { [key: string]: Json }), type };
  }

  private uniqueNames(): Json[] {
    return Array.from({ length: UNIQUE_BATCH }, () => `u${this.unique++}`);
  }

  private value(depth: number): Json {
    const kind = this.rng.int(depth >= MAX_DEPTH ? LEAF_KINDS : VALUE_KINDS);
    switch (kind) {
      case ValueKind.Null:
        return null;
      case ValueKind.Bool:
        return this.rng.int(2) === 0;
      case ValueKind.Int:
        return this.rng.int(SMALL_INT * 2) - SMALL_INT;
      case ValueKind.Fraction:
        return (this.rng.int(FRACTION_RANGE * 2) - FRACTION_RANGE) / FRACTION_DIGITS_SCALE;
      case ValueKind.Large:
        return this.pick(LARGE_NUMBERS);
      case ValueKind.Text:
        return this.text();
      case ValueKind.Array:
        return Array.from({ length: this.rng.int(MAX_ITEMS) }, () => this.value(depth + 1));
      case ValueKind.Keyed:
        return this.keyed(depth);
      default:
        return this.object(depth);
    }
  }

  private text(): string {
    if (this.rng.int(4) === 0) return 'L'.repeat(WIRE_MAX_INTERNED_LENGTH + 1 + this.rng.int(MAX_ITEMS));
    if (this.rng.int(4) === 0) return `u${this.unique++}`;
    return `s${this.rng.int(KEY_POOL)}`;
  }

  private keyed(depth: number): Json[] {
    return Array.from({ length: 1 + this.rng.int(MAX_ITEMS) }, () => this.keyedItem(depth));
  }

  private keyedItem(depth: number): Json {
    return { ...this.object(depth + 1), [WIRE_KEYED_FIELD]: `t${this.rng.int(KEY_POOL)}` };
  }

  private object(depth: number): { [key: string]: Json } {
    const result: { [key: string]: Json } = {};
    const count = this.rng.int(MAX_ITEMS);
    for (let index = 0; index < count; index++) result[this.pick(FIELD_NAMES)] = this.value(depth + 1);
    return result;
  }

  private mutate(value: Json, depth: number): Json {
    if (depth >= MAX_DEPTH || this.rng.int(MAX_ITEMS) === 0) return this.value(depth);
    if (Array.isArray(value)) return this.mutateArray(value, depth);
    if (typeof value === 'object' && value !== null) return this.mutateObject(value, depth);
    return this.rng.int(2) === 0 ? value : this.value(depth);
  }

  private mutateArray(items: Json[], depth: number): Json {
    const keyed = items.length > 0 && items.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item) && WIRE_KEYED_FIELD in item);
    const result = items.map((item) => (this.rng.int(2) === 0 ? item : this.mutate(item, depth + 1)));
    if (this.rng.int(3) === 0) result.splice(this.rng.int(result.length + 1), 1);
    if (this.rng.int(3) === 0) result.splice(this.rng.int(result.length + 1), 0, keyed ? this.keyedItem(depth) : this.value(depth + 1));
    if (keyed && this.rng.int(2) === 0) result.reverse();
    return result;
  }

  private mutateObject(fields: { [key: string]: Json }, depth: number): Json {
    const result: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(fields)) {
      if (key === WIRE_KEYED_FIELD) result[key] = item;
      else if (this.rng.int(4) !== 0) result[key] = this.rng.int(2) === 0 ? item : this.mutate(item, depth + 1);
    }
    if (this.rng.int(3) === 0) result[this.pick(FIELD_NAMES)] = this.value(depth + 1);
    return result;
  }
}
