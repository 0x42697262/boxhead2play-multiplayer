import { describe, expect, it } from 'vitest';
import { SeededRng } from '../../src/domain/math/Rng.ts';
import { CharacterStyle, ClipMode, VisualKind, VisualLayer } from '../../src/domain/visuals.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import { Difficulty, GameAmount, GameSpeed, type PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import { PlayerControl } from '../../src/domain/world/input.ts';
import { CONTROL_ORDER, controlBit } from '../../src/net/controlMask.ts';
import { DrawListDecoder, DrawListEncoder } from '../../src/net/drawListWire.ts';
import { encodeServerMessage, ServerMessageType, type NetDrawEntry, type ServerMessage } from '../../src/net/protocol.ts';
import { ServerWireDecoder, ServerWireEncoder } from '../../src/net/serverWire.ts';
import { WireError } from '../../src/net/wire.ts';
import { Match } from '../../src/server/Match.ts';
import { loadGameContent } from '../../src/server/node/content.ts';
import { assetsMissing } from '../adapters/assets/support.ts';
import { frame, START } from '../services/online/support.ts';

function zombie(key: string, x: number, frameIndex = 0, extra: Partial<NetDrawEntry> = {}): NetDrawEntry {
  return {
    thingKey: key,
    sortFloor: false,
    position: { x, y: 4.5, z: 0 },
    visual: { kind: VisualKind.Character, layer: VisualLayer.World, style: CharacterStyle.Zombie, animation: 'Zombie_Zombie_Walk', direction: 2, frame: frameIndex, alpha: 100 },
    ...extra,
  };
}

const MATCH_SIMULATION_TIMEOUT_MS = 60_000;

const SMOKE: NetDrawEntry = {
  thingKey: 'c1',
  sortFloor: true,
  position: { x: 3.25, y: 7, z: 0.5 },
  visual: { kind: VisualKind.Clip, layer: VisualLayer.World, mode: ClipMode.OmniDirectional, symbol: 'Effect.Smoke', frame: 3, rotationCount: 8, angleRadians: -1.5708, scale: 0.75, alpha: 37.5, position: { x: 3, y: 7, z: 1 } },
};

const LASER: NetDrawEntry = {
  thingKey: 'l1',
  sortFloor: false,
  position: { x: 1, y: 1, z: 0 },
  visual: {
    kind: VisualKind.Group,
    items: [
      { kind: VisualKind.Line, layer: VisualLayer.Overlay, from: { x: 1, y: 1, z: 0.4 }, to: { x: 9.5, y: -2, z: 0.4 }, thickness: 2.5, color: 0xff0000, alpha: 40 },
      { kind: VisualKind.Square, layer: VisualLayer.Overlay, topLeftPx: { x: -4.5, y: 10 }, sizePx: 3, color: 0xffffff, alpha: 100, solid: true },
    ],
  },
};

function pair(): (entries: readonly NetDrawEntry[]) => { bytes: number; decoded: NetDrawEntry[] } {
  const encoder = new DrawListEncoder();
  const decoder = new DrawListDecoder();
  return (entries) => {
    const bytes = encoder.encode(entries);
    return { bytes: bytes.length, decoded: decoder.decode(bytes) };
  };
}

function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === 'number' && !Number.isInteger(item) ? Math.round(item * 1000) / 1000 : item)));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([first], [second]) => (first < second ? -1 : 1)).map(([key, item]) => [key, sorted(item)]));
}

function sortedJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

describe('draw list wire codec', () => {
  it('round-trips every visual kind with optional fields, rounding fractions to 3 decimals', () => {
    const send = pair();
    const entries = [zombie('t1', 2.12345), SMOKE, LASER];
    expect(asJson(send(entries).decoded)).toEqual(asJson(entries));
  });

  it('sends an unchanged entry in one byte and a walking zombie step in a few', () => {
    const send = pair();
    const crowd = (x: number, frameIndex: number) => Array.from({ length: 40 }, (_unused, index) => zombie(`t${index}`, index === 7 ? x : index, index === 7 ? frameIndex : 0));
    send(crowd(7, 0));
    const unchanged = send(crowd(7, 0));
    const step = send(crowd(7.05, 1));
    expect(unchanged.bytes).toBe(1 + 40);
    expect(step.bytes - unchanged.bytes).toBeLessThanOrEqual(4);
    expect(step.decoded).toEqual(crowd(7.05, 1));
  });

  it('follows changes of animation, direction, alpha, sort order, style and kind', () => {
    const send = pair();
    send([zombie('t1', 1), SMOKE]);
    const changed = [
      zombie('t1', 1, 4, { sortFloor: true, visual: { ...zombie('t1', 1).visual, animation: 'Zombie_Zombie_Die', direction: 5, alpha: 62.5 } as NetDrawEntry['visual'] }),
      { ...SMOKE, visual: { ...SMOKE.visual, frame: 4, alpha: 30 } as NetDrawEntry['visual'] },
    ];
    expect(asJson(send(changed).decoded)).toEqual(asJson(changed));
    const replaced = [zombie('t1', 1, 0, { visual: { ...zombie('t1', 1).visual, style: CharacterStyle.Devil } as NetDrawEntry['visual'] }), { ...SMOKE, visual: LASER.visual }];
    expect(asJson(send(replaced).decoded)).toEqual(asJson(replaced));
  });

  it('reuses the slots of things that left and keeps the draw order', () => {
    const send = pair();
    send([zombie('t1', 1), zombie('t2', 2), zombie('t3', 3)]);
    send([zombie('t3', 3)]);
    const next = [zombie('t5', 5), zombie('t3', 3), zombie('t4', 4), zombie('t1', 1)];
    expect(send(next).decoded).toEqual(next);
    expect(send([zombie('t1', 1), zombie('t1', 1.5)]).decoded).toEqual([zombie('t1', 1), zombie('t1', 1.5)]);
    expect(send([zombie('t1', 1.5)]).decoded).toEqual([zombie('t1', 1.5)]);
  });

  it('rejects slots the decoder has never seen and a fresh decoder after a reset only on the encoder side', () => {
    const encoder = new DrawListEncoder();
    const decoder = new DrawListDecoder();
    decoder.decode(encoder.encode([zombie('t1', 1)]));
    expect(() => new DrawListDecoder().decode(encoder.encode([zombie('t1', 1)]))).toThrow(WireError);
    expect(() => decoder.decode(new Uint8Array([1, 3 * 9]))).toThrow(WireError);
    expect(() => decoder.decode(new Uint8Array([1]))).toThrow(WireError);
    encoder.reset();
    decoder.reset();
    expect(decoder.decode(encoder.encode([zombie('t2', 2)]))).toEqual([zombie('t2', 2)]);
  });

  it('refuses numbers it cannot represent instead of sending something else', () => {
    expect(() => new DrawListEncoder().encode([zombie('t1', Number.NaN)])).toThrow(WireError);
  });
});

describe('server wire codec', () => {
  it('packs frame entries and starts over on gameStarted on both sides', () => {
    const encoder = new ServerWireEncoder();
    const decoder = new ServerWireDecoder();
    const send = (message: ServerMessage): unknown => decoder.decode(encoder.encode(message));
    const first = frame(1, { entries: [zombie('t1', 1), SMOKE] });
    expect(asJson(send(first))).toEqual(asJson(first));
    expect(asJson(send(START))).toEqual(asJson(START));
    const second = frame(2, { entries: [zombie('t9', 9)] });
    expect(send(second)).toEqual(second);
  });

  it.skipIf(assetsMissing)('decodes every frame of a busy 4-player match exactly like the JSON encoding', async () => {
    const content = await loadGameContent('public/assets');
    const options = { difficulty: Difficulty.Nightmare, gameSpeed: GameSpeed.Normal, devilsActive: true, collisionsActive: true, damageActive: true, gameAmount: GameAmount.Kills10, detail: true };
    const match = Match.start({ id: 'm', mode: GameMode.Coop, roomId: 'ROOM_Single_0001', options, characters: [0, 1, 2, 3] as PlayerCharacter[], seed: 7 }, content);
    if (!match) throw new Error('room missing');
    const rng = new SeededRng(7);
    const encoders = new Map<number, ServerWireEncoder>();
    const decoders = new Map<number, ServerWireDecoder>();
    let compared = 0;
    for (let tick = 1; tick <= 1500; tick++) {
      if (tick % 20 === 1) {
        for (const index of match.playerIndexes) {
          const move = CONTROL_ORDER.filter((control) => control !== PlayerControl.Fire)[rng.int(CONTROL_ORDER.length - 1)];
          const down = (move ? controlBit(move) : 0) | controlBit(PlayerControl.Fire);
          match.input(index, { down, pressed: down, released: 0 });
        }
      }
      for (const [index, sent] of match.step().frames) {
        const encoder = encoders.get(index) ?? new ServerWireEncoder();
        const decoder = decoders.get(index) ?? new ServerWireDecoder();
        encoders.set(index, encoder);
        decoders.set(index, decoder);
        const decoded = decoder.decode(encoder.encode(sent));
        expect(sortedJson(decoded)).toBe(sortedJson(JSON.parse(encodeServerMessage(sent))));
        expect((decoded as { type: string }).type).toBe(ServerMessageType.Frame);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(5000);
  }, MATCH_SIMULATION_TIMEOUT_MS);
});
