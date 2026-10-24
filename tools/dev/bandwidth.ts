import { Deflate as FlateStream } from 'fflate';
import { SeededRng } from '../../src/domain/math/Rng.ts';
import { GameMode } from '../../src/domain/world/GameMode.ts';
import type { PlayerCharacter } from '../../src/domain/world/SimulationSettings.ts';
import { Difficulty, GameAmount, GameSpeed } from '../../src/domain/world/SimulationSettings.ts';
import { CONTROL_ORDER, controlBit } from '../../src/net/controlMask.ts';
import { encodeServerMessage, type LobbyOptions, type OnlineMode } from '../../src/net/protocol.ts';
import { WireDecoder, WireEncoder } from '../../src/net/wire.ts';
import { Match } from '../../src/server/Match.ts';
import { loadGameContent } from '../../src/server/node/content.ts';

const ASSET_DIR = 'public/assets';
const ROOM_ID = 'ROOM_Single_0001';
const SECONDS = 30;
const SEED = 7;
const PLAYER_COUNTS = [1, 4, 16] as const;
const HOLD_TICKS = 20;
const KIB = 1024;
const FIRE = 'fire';
const OPTIONS: LobbyOptions = {
  difficulty: Difficulty.Beginner,
  gameSpeed: GameSpeed.Normal,
  devilsActive: true,
  collisionsActive: true,
  damageActive: true,
  gameAmount: GameAmount.Kills10,
  detail: true,
};

interface Totals {
  json: number;
  jsonDeflate: number;
  wire: number;
  wireDeflate: number;
}

function measure(mode: OnlineMode, players: number, content: Awaited<ReturnType<typeof loadGameContent>>): Totals {
  const characters = Array.from({ length: players }, (_unused, index) => (index % 4) as PlayerCharacter);
  const match = Match.start({ id: 'm', mode, roomId: ROOM_ID, options: OPTIONS, characters, seed: SEED }, content);
  if (!match) throw new Error('room missing');
  const rng = new SeededRng(SEED);
  const encoders = new Map<number, WireEncoder>();
  const decoders = new Map<number, WireDecoder>();
  let mismatches = 0;
  const jsonStreams = new Map<number, Deflate>();
  const wireStreams = new Map<number, Deflate>();
  const totals: Totals = { json: 0, jsonDeflate: 0, wire: 0, wireDeflate: 0 };
  const ticks = SECONDS * match.ticksPerSecond;
  for (let tick = 0; tick < ticks; tick++) {
    if (tick % HOLD_TICKS === 0) {
      for (const index of match.playerIndexes) {
        const move = CONTROL_ORDER.filter((control) => control !== FIRE)[rng.int(CONTROL_ORDER.length - 1)];
        const down = (move ? controlBit(move) : 0) | controlBit(FIRE);
        match.input(index, { down, pressed: down, released: 0 });
      }
    }
    const step = match.step();
    for (const [index, frame] of step.frames) {
      const json = encodeServerMessage(frame);
      const encoder = encoders.get(index) ?? new WireEncoder();
      encoders.set(index, encoder);
      const wire = encoder.encode(frame);
      const decoder = decoders.get(index) ?? new WireDecoder();
      decoders.set(index, decoder);
      const decoded = JSON.stringify(sorted(decoder.decode(wire)));
      const expected = JSON.stringify(sorted(JSON.parse(json)));
      if (decoded !== expected) {
        if (mismatches === 0 && process.env.WIRE_DEBUG) {
          for (let at = 0; at < decoded.length; at++) {
            if (decoded[at] !== expected[at]) {
              console.log('decoded ', decoded.slice(Math.max(0, at - 300), at + 200));
              console.log('expected', expected.slice(Math.max(0, at - 300), at + 200));
              break;
            }
          }
        }
        mismatches++;
      }
      totals.json += Buffer.byteLength(json);
      totals.wire += wire.byteLength;
      totals.jsonDeflate += deflated(jsonStreams, index, Buffer.from(json));
      totals.wireDeflate += deflated(wireStreams, index, wire);
    }
  }
  if (mismatches > 0) console.log(`  ${mismatches} decoded frames differ from the JSON`);
  const clients = Math.max(1, players);
  return { json: totals.json / clients, jsonDeflate: totals.jsonDeflate / clients, wire: totals.wire / clients, wireDeflate: totals.wireDeflate / clients };
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([first], [second]) => (first < second ? -1 : 1)).map(([key, item]) => [key, sorted(item)]));
}

class Deflate {
  private produced = 0;
  private readonly stream = new FlateStream((chunk) => {
    this.produced += chunk.length;
  });

  size(bytes: Uint8Array): number {
    const before = this.produced;
    this.stream.push(bytes);
    this.stream.flush(true);
    return this.produced - before;
  }
}

function deflated(streams: Map<number, Deflate>, index: number, bytes: Uint8Array): number {
  const stream = streams.get(index) ?? new Deflate();
  streams.set(index, stream);
  return stream.size(bytes);
}

function perSecond(bytes: number): string {
  return `${(bytes / SECONDS / KIB).toFixed(1)} KiB/s`;
}

const content = await loadGameContent(ASSET_DIR);
for (const mode of [GameMode.Coop, GameMode.DeathMatch] as const) {
  for (const players of PLAYER_COUNTS) {
    if (mode === GameMode.DeathMatch && players === 1) continue;
    const totals = measure(mode, players, content);
    console.log(`${mode} ${players}p per client: json ${perSecond(totals.json)}, json+deflate ${perSecond(totals.jsonDeflate)}, wire ${perSecond(totals.wire)}, wire+deflate ${perSecond(totals.wireDeflate)}`);
  }
}
