import { describe, expect, it } from 'vitest';
import { WIRE_STRING_TABLE_LIMIT } from '../../src/net/tuning.ts';
import { WireDecoder, WireEncoder, WireError } from '../../src/net/wire.ts';

type Message = { readonly type: string; readonly [key: string]: unknown };

function pair(): { send: (message: Message) => { bytes: number; decoded: unknown } } {
  const encoder = new WireEncoder();
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
});
