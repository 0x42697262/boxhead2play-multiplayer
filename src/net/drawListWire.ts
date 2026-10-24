import type { Point2, Point3 } from '../domain/events.ts';
import { CharacterStyle, ClipMode, VisualKind, VisualLayer, type OverlayVisual } from '../domain/visuals.ts';
import { ByteReader, ByteWriter, fixedOf, fromFixed, unzigzag, WireError, zigzag } from './bytes.ts';
import type { NetCharacterVisual, NetClipVisual, NetDrawEntry, NetVisual } from './protocol.ts';
import { WIRE_MAX_INTERNED_LENGTH, WIRE_STRING_TABLE_LIMIT } from './tuning.ts';

const EntryState = {
  Same: 0,
  Changed: 1,
  New: 2,
} as const;

type EntryState = (typeof EntryState)[keyof typeof EntryState];

const ENTRY_STATE_COUNT = 3;

const Change = {
  X: 1,
  Y: 2,
  Z: 4,
  Frame: 8,
  Direction: 16,
  Alpha: 32,
  Animation: 64,
  Visual: 128,
  SortFloor: 256,
} as const;

const ClipOption = {
  RotationIndex: 1,
  RotationCount: 2,
  AngleRadians: 4,
  Position: 8,
} as const;

const StringSlot = {
  New: 0,
  Raw: 1,
  FirstId: 2,
} as const;

const NUMBER_FLAG_BITS = 2;

const KINDS = Object.values(VisualKind);
const STYLES = Object.values(CharacterStyle);
const CLIP_MODES = Object.values(ClipMode);

type FixedPoint = readonly [number, number, number];

interface SlotState {
  readonly id: number;
  readonly entry: NetDrawEntry;
  readonly fixed: FixedPoint;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function fixedPoint(point: Point3): FixedPoint {
  return [fixedOf(point.x), fixedOf(point.y), fixedOf(point.z)];
}

function pointOf(fixed: FixedPoint): Point3 {
  return { x: fromFixed(fixed[0]), y: fromFixed(fixed[1]), z: fromFixed(fixed[2]) };
}

function samePoint(first: Point3 | undefined, second: Point3 | undefined): boolean {
  if (!first || !second) return first === second;
  return fixedOf(first.x) === fixedOf(second.x) && fixedOf(first.y) === fixedOf(second.y) && fixedOf(first.z) === fixedOf(second.z);
}

function indexOf<T>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  if (index < 0) throw new WireError(`not encodable: ${String(value)}`);
  return index;
}

function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new WireError(`unknown index ${index}`);
  return value;
}

function writeNumber(writer: ByteWriter, value: number): void {
  if (Number.isSafeInteger(value) && value >= 0) {
    writer.varint(value * NUMBER_FLAG_BITS);
    return;
  }
  const fixed = fixedOf(value);
  if (!Number.isSafeInteger(fixed)) throw new WireError(`number not encodable: ${value}`);
  writer.varint(zigzag(fixed) * NUMBER_FLAG_BITS + 1);
}

function readNumber(reader: ByteReader): number {
  const value = reader.varint();
  if (value % NUMBER_FLAG_BITS === 0) return value / NUMBER_FLAG_BITS;
  return fromFixed(unzigzag((value - 1) / NUMBER_FLAG_BITS));
}

function writeFixed(writer: ByteWriter, fixed: number): void {
  if (!Number.isSafeInteger(fixed)) throw new WireError(`position not encodable: ${fixed}`);
  writer.varint(zigzag(fixed));
}

function writePoint(writer: ByteWriter, point: Point3): void {
  for (const fixed of fixedPoint(point)) writeFixed(writer, fixed);
}

function readFixedPoint(reader: ByteReader): FixedPoint {
  return [unzigzag(reader.varint()), unzigzag(reader.varint()), unzigzag(reader.varint())];
}

function readPoint(reader: ByteReader): Point3 {
  return pointOf(readFixedPoint(reader));
}

function writePoint2(writer: ByteWriter, point: Point2): void {
  writeFixed(writer, fixedOf(point.x));
  writeFixed(writer, fixedOf(point.y));
}

function readPoint2(reader: ByteReader): Point2 {
  return { x: fromFixed(unzigzag(reader.varint())), y: fromFixed(unzigzag(reader.varint())) };
}

function overlayEqual(first: NetVisual, second: NetVisual): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function hotChanges(previous: NetVisual, visual: NetVisual): number | undefined {
  if (previous.kind === VisualKind.Character && visual.kind === VisualKind.Character) {
    if (previous.style !== visual.style || !samePoint(previous.position, visual.position)) return undefined;
    return (
      (previous.frame === visual.frame ? 0 : Change.Frame) |
      (previous.direction === visual.direction ? 0 : Change.Direction) |
      (previous.alpha === visual.alpha ? 0 : Change.Alpha) |
      (previous.animation === visual.animation ? 0 : Change.Animation)
    );
  }
  if (previous.kind === VisualKind.Clip && visual.kind === VisualKind.Clip) {
    const same =
      previous.mode === visual.mode &&
      previous.symbol === visual.symbol &&
      previous.scale === visual.scale &&
      previous.rotationIndex === visual.rotationIndex &&
      previous.rotationCount === visual.rotationCount &&
      previous.angleRadians === visual.angleRadians &&
      samePoint(previous.position, visual.position);
    if (!same) return undefined;
    return (previous.frame === visual.frame ? 0 : Change.Frame) | (previous.alpha === visual.alpha ? 0 : Change.Alpha);
  }
  return overlayEqual(previous, visual) ? 0 : undefined;
}

export class DrawListEncoder {
  private readonly writer = new ByteWriter();
  private readonly strings = new Map<string, number>();
  private byKey = new Map<string, SlotState>();
  private readonly freeIds: number[] = [];
  private nextId = 0;

  reset(): void {
    this.strings.clear();
    this.byKey.clear();
    this.freeIds.length = 0;
    this.nextId = 0;
  }

  encode(entries: readonly NetDrawEntry[]): Uint8Array {
    const writer = this.writer;
    writer.rewind(0);
    writer.varint(entries.length);
    const next = new Map<string, SlotState>();
    const released = new Set<number>();
    for (const entry of entries) {
      const previous = next.has(entry.thingKey) ? undefined : this.byKey.get(entry.thingKey);
      const id = previous?.id ?? this.freeIds.pop() ?? this.nextId++;
      const fixed = fixedPoint(entry.position);
      const replaced = next.get(entry.thingKey);
      if (replaced) released.add(replaced.id);
      next.set(entry.thingKey, { id, entry, fixed });
      if (previous) this.writeKnown(id, previous, entry, fixed);
      else this.writeNew(id, entry);
    }
    for (const [key, state] of this.byKey) if (next.get(key)?.id !== state.id) released.add(state.id);
    this.freeIds.push(...released);
    this.byKey = next;
    return writer.result();
  }

  private head(id: number, state: EntryState): void {
    this.writer.varint(id * ENTRY_STATE_COUNT + state);
  }

  private writeKnown(id: number, previous: SlotState, entry: NetDrawEntry, fixed: FixedPoint): void {
    const hot = hotChanges(previous.entry.visual, entry.visual);
    const mask =
      (fixed[0] === previous.fixed[0] ? 0 : Change.X) |
      (fixed[1] === previous.fixed[1] ? 0 : Change.Y) |
      (fixed[2] === previous.fixed[2] ? 0 : Change.Z) |
      (entry.sortFloor === previous.entry.sortFloor ? 0 : Change.SortFloor) |
      (hot ?? Change.Visual);
    if (mask === 0) {
      this.head(id, EntryState.Same);
      return;
    }
    this.head(id, EntryState.Changed);
    const writer = this.writer;
    writer.varint(mask);
    if (mask & Change.X) writer.varint(zigzag(fixed[0] - previous.fixed[0]));
    if (mask & Change.Y) writer.varint(zigzag(fixed[1] - previous.fixed[1]));
    if (mask & Change.Z) writer.varint(zigzag(fixed[2] - previous.fixed[2]));
    const visual = entry.visual;
    if (mask & Change.Visual) {
      this.visual(visual);
      return;
    }
    if (visual.kind !== VisualKind.Character && visual.kind !== VisualKind.Clip) return;
    if (mask & Change.Frame) writeNumber(writer, visual.frame);
    if (visual.kind === VisualKind.Character && mask & Change.Direction) writeNumber(writer, visual.direction);
    if (mask & Change.Alpha) writeNumber(writer, visual.alpha);
    if (visual.kind === VisualKind.Character && mask & Change.Animation) this.string(visual.animation, true);
  }

  private writeNew(id: number, entry: NetDrawEntry): void {
    this.head(id, EntryState.New);
    this.string(entry.thingKey, false);
    this.writer.u8(entry.sortFloor ? 1 : 0);
    writePoint(this.writer, entry.position);
    this.visual(entry.visual);
  }

  private visual(visual: NetVisual): void {
    const writer = this.writer;
    writer.u8(indexOf(KINDS, visual.kind));
    switch (visual.kind) {
      case VisualKind.Character:
        writer.u8(indexOf(STYLES, visual.style));
        this.string(visual.animation, true);
        writeNumber(writer, visual.direction);
        writeNumber(writer, visual.frame);
        writeNumber(writer, visual.alpha);
        writer.u8(visual.position ? 1 : 0);
        if (visual.position) writePoint(writer, visual.position);
        return;
      case VisualKind.Clip: {
        writer.u8(indexOf(CLIP_MODES, visual.mode));
        this.string(visual.symbol, true);
        writeNumber(writer, visual.frame);
        writeNumber(writer, visual.scale);
        writeNumber(writer, visual.alpha);
        writer.u8(
          (visual.rotationIndex === undefined ? 0 : ClipOption.RotationIndex) |
            (visual.rotationCount === undefined ? 0 : ClipOption.RotationCount) |
            (visual.angleRadians === undefined ? 0 : ClipOption.AngleRadians) |
            (visual.position ? ClipOption.Position : 0),
        );
        if (visual.rotationIndex !== undefined) writeNumber(writer, visual.rotationIndex);
        if (visual.rotationCount !== undefined) writeNumber(writer, visual.rotationCount);
        if (visual.angleRadians !== undefined) writeNumber(writer, visual.angleRadians);
        if (visual.position) writePoint(writer, visual.position);
        return;
      }
      case VisualKind.Line:
        writePoint(writer, visual.from);
        writePoint(writer, visual.to);
        writeNumber(writer, visual.thickness);
        writeNumber(writer, visual.color);
        writeNumber(writer, visual.alpha);
        return;
      case VisualKind.Square:
        writePoint2(writer, visual.topLeftPx);
        writeNumber(writer, visual.sizePx);
        writeNumber(writer, visual.color);
        writeNumber(writer, visual.alpha);
        writer.u8(visual.solid ? 1 : 0);
        return;
      case VisualKind.Group:
        writer.varint(visual.items.length);
        for (const item of visual.items) this.visual(item);
        return;
    }
  }

  private string(value: string, internable: boolean): void {
    const id = this.strings.get(value);
    if (id !== undefined) {
      this.writer.varint(id + StringSlot.FirstId);
      return;
    }
    const interned = internable && value.length <= WIRE_MAX_INTERNED_LENGTH && this.strings.size < WIRE_STRING_TABLE_LIMIT;
    this.writer.varint(interned ? StringSlot.New : StringSlot.Raw);
    this.writer.raw(textEncoder.encode(value));
    if (interned) this.strings.set(value, this.strings.size);
  }
}

interface DecodedSlot {
  readonly entry: NetDrawEntry;
  readonly fixed: FixedPoint;
}

export class DrawListDecoder {
  private readonly strings: string[] = [];
  private slots = new Map<number, DecodedSlot>();

  reset(): void {
    this.strings.length = 0;
    this.slots.clear();
  }

  decode(bytes: Uint8Array): NetDrawEntry[] {
    const reader = new ByteReader(bytes);
    const count = reader.varint();
    if (count > reader.remaining) throw new WireError('count too large');
    const next = new Map<number, DecodedSlot>();
    const entries: NetDrawEntry[] = [];
    for (let index = 0; index < count; index++) {
      const head = reader.varint();
      const id = Math.floor(head / ENTRY_STATE_COUNT);
      if (next.has(id)) throw new WireError(`slot ${id} twice`);
      const slot = this.slot(reader, id, head % ENTRY_STATE_COUNT);
      next.set(id, slot);
      entries.push(slot.entry);
    }
    if (!reader.done) throw new WireError('trailing bytes');
    this.slots = next;
    return entries;
  }

  private slot(reader: ByteReader, id: number, state: number): DecodedSlot {
    if (state === EntryState.New) {
      const thingKey = this.string(reader);
      const sortFloor = reader.u8() === 1;
      const fixed = readFixedPoint(reader);
      return { fixed, entry: { thingKey, sortFloor, position: pointOf(fixed), visual: this.visual(reader) } };
    }
    const previous = this.slots.get(id);
    if (!previous) throw new WireError(`unknown slot ${id}`);
    if (state === EntryState.Same) return previous;
    return this.changed(reader, previous);
  }

  private changed(reader: ByteReader, previous: DecodedSlot): DecodedSlot {
    const mask = reader.varint();
    const fixed: FixedPoint = [
      previous.fixed[0] + (mask & Change.X ? unzigzag(reader.varint()) : 0),
      previous.fixed[1] + (mask & Change.Y ? unzigzag(reader.varint()) : 0),
      previous.fixed[2] + (mask & Change.Z ? unzigzag(reader.varint()) : 0),
    ];
    const sortFloor = mask & Change.SortFloor ? !previous.entry.sortFloor : previous.entry.sortFloor;
    const visual = mask & Change.Visual ? this.visual(reader) : this.hotVisual(reader, mask, previous.entry.visual);
    return { fixed, entry: { thingKey: previous.entry.thingKey, sortFloor, position: pointOf(fixed), visual } };
  }

  private hotVisual(reader: ByteReader, mask: number, visual: NetVisual): NetVisual {
    if (visual.kind === VisualKind.Character) {
      const frame = mask & Change.Frame ? readNumber(reader) : visual.frame;
      const direction = mask & Change.Direction ? readNumber(reader) : visual.direction;
      const alpha = mask & Change.Alpha ? readNumber(reader) : visual.alpha;
      const animation = mask & Change.Animation ? this.string(reader) : visual.animation;
      return { ...visual, frame, direction, alpha, animation };
    }
    if (visual.kind === VisualKind.Clip) {
      const frame = mask & Change.Frame ? readNumber(reader) : visual.frame;
      const alpha = mask & Change.Alpha ? readNumber(reader) : visual.alpha;
      return { ...visual, frame, alpha };
    }
    return visual;
  }

  private visual(reader: ByteReader): NetVisual {
    const kind = at(KINDS, reader.u8());
    switch (kind) {
      case VisualKind.Character:
        return this.character(reader);
      case VisualKind.Clip:
        return this.clip(reader);
      case VisualKind.Line:
      case VisualKind.Square:
        return this.overlay(reader, kind);
      case VisualKind.Group: {
        const count = reader.varint();
        if (count > reader.remaining) throw new WireError('count too large');
        const items: OverlayVisual[] = [];
        for (let index = 0; index < count; index++) {
          const itemKind = at(KINDS, reader.u8());
          if (itemKind !== VisualKind.Line && itemKind !== VisualKind.Square) throw new WireError(`group item ${itemKind}`);
          items.push(this.overlay(reader, itemKind));
        }
        return { kind, items };
      }
    }
  }

  private character(reader: ByteReader): NetCharacterVisual {
    const style = at(STYLES, reader.u8());
    const animation = this.string(reader);
    const direction = readNumber(reader);
    const frame = readNumber(reader);
    const alpha = readNumber(reader);
    const visual: NetCharacterVisual = { kind: VisualKind.Character, layer: VisualLayer.World, style, animation, direction, frame, alpha };
    return reader.u8() === 1 ? { ...visual, position: readPoint(reader) } : visual;
  }

  private clip(reader: ByteReader): NetClipVisual {
    const mode = at(CLIP_MODES, reader.u8());
    const symbol = this.string(reader);
    const frame = readNumber(reader);
    const scale = readNumber(reader);
    const alpha = readNumber(reader);
    const options = reader.u8();
    return {
      kind: VisualKind.Clip,
      layer: VisualLayer.World,
      mode,
      symbol,
      frame,
      scale,
      alpha,
      ...(options & ClipOption.RotationIndex ? { rotationIndex: readNumber(reader) } : {}),
      ...(options & ClipOption.RotationCount ? { rotationCount: readNumber(reader) } : {}),
      ...(options & ClipOption.AngleRadians ? { angleRadians: readNumber(reader) } : {}),
      ...(options & ClipOption.Position ? { position: readPoint(reader) } : {}),
    };
  }

  private overlay(reader: ByteReader, kind: typeof VisualKind.Line | typeof VisualKind.Square): OverlayVisual {
    if (kind === VisualKind.Line) {
      const from = readPoint(reader);
      const to = readPoint(reader);
      return { kind, layer: VisualLayer.Overlay, from, to, thickness: readNumber(reader), color: readNumber(reader), alpha: readNumber(reader) };
    }
    const topLeftPx = readPoint2(reader);
    const sizePx = readNumber(reader);
    const color = readNumber(reader);
    const alpha = readNumber(reader);
    return { kind, layer: VisualLayer.Overlay, topLeftPx, sizePx, color, alpha, solid: reader.u8() === 1 };
  }

  private string(reader: ByteReader): string {
    const slot = reader.varint();
    if (slot === StringSlot.New || slot === StringSlot.Raw) {
      const value = textDecoder.decode(reader.raw());
      if (slot === StringSlot.New) {
        if (this.strings.length >= WIRE_STRING_TABLE_LIMIT) throw new WireError('string table full');
        this.strings.push(value);
      }
      return value;
    }
    const value = this.strings[slot - StringSlot.FirstId];
    if (value === undefined) throw new WireError('unknown string');
    return value;
  }
}
