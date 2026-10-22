import { clipFrameCount, type AnimationCatalog } from '../animation/AnimationCatalog.ts';
import { DecalKind, DomainEventType, type EventSink } from '../events.ts';
import type { Position } from '../math/Position.ts';
import type { Rng } from '../math/Rng.ts';
import {
  BLOOD_SPLAT_JITTER_CELLS,
  CELL_SIZE_PX,
  DECAL_DIRECTIONS,
  DECAL_SCALE_X,
  DECAL_SCALE_Y,
  MISSING_CLIP_FRAME_COUNT,
} from './tuning.ts';

export const DecalSymbol = {
  BloodSplat: 'Effect.BloodSplat',
  ScorchMark: 'Effect.ScorchMark',
} as const;

export class MapDecals {
  constructor(
    private readonly rng: Rng,
    private readonly events: EventSink,
    private readonly animations: AnimationCatalog,
  ) {}

  bloodSplat(position: Position): void {
    const frame = this.randomFrame(DecalSymbol.BloodSplat);
    const xPx = (position.x + this.jitter()) * CELL_SIZE_PX;
    const yPx = (position.y + this.jitter()) * CELL_SIZE_PX;
    this.emit(DecalKind.BloodSplat, DecalSymbol.BloodSplat, xPx, yPx, frame);
  }

  scorchMark(position: Position): void {
    const frame = this.randomFrame(DecalSymbol.ScorchMark);
    this.emit(DecalKind.ScorchMark, DecalSymbol.ScorchMark, position.x * CELL_SIZE_PX, position.y * CELL_SIZE_PX, frame);
  }

  private randomFrame(symbol: string): number {
    return this.rng.int(clipFrameCount(this.animations, symbol, MISSING_CLIP_FRAME_COUNT));
  }

  private jitter(): number {
    return this.rng.next() * BLOOD_SPLAT_JITTER_CELLS - BLOOD_SPLAT_JITTER_CELLS / 2;
  }

  private emit(decal: DecalKind, symbol: string, xPx: number, yPx: number, frame: number): void {
    this.events.emit({
      type: DomainEventType.DecalRequested,
      decal,
      symbol,
      xPx,
      yPx,
      frame,
      rotationIndex: this.rng.int(DECAL_DIRECTIONS),
      rotationCount: DECAL_DIRECTIONS,
      scaleX: DECAL_SCALE_X,
      scaleY: DECAL_SCALE_Y,
    });
  }
}
