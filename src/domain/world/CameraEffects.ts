import type { Point2 } from '../events.ts';
import { rectSees, type CameraRect } from './camera.ts';
import { ScreenEffects } from './ScreenEffects.ts';
import { SCREEN_EFFECT_SOURCE_MARGIN_PX } from './tuning.ts';

export interface WatchingCamera {
  readonly playerIndex: number;
  readonly rect: CameraRect;
}

export interface CameraEffectsView {
  readonly shake: Point2;
  readonly brightness: number;
}

export const NO_CAMERA_EFFECTS: CameraEffectsView = { shake: { x: 0, y: 0 }, brightness: 0 };

export class CameraEffects {
  private readonly byPlayer = new Map<number, ScreenEffects>();

  open(playerIndex: number, brightness: number): void {
    this.byPlayer.set(playerIndex, new ScreenEffects(brightness));
  }

  close(playerIndex: number): void {
    this.byPlayer.delete(playerIndex);
  }

  of(playerIndex: number): ScreenEffects {
    const existing = this.byPlayer.get(playerIndex);
    if (existing) return existing;
    const created = new ScreenEffects();
    this.byPlayer.set(playerIndex, created);
    return created;
  }

  keepOnly(playerIndexes: readonly number[]): void {
    const kept = new Set(playerIndexes);
    for (const playerIndex of [...this.byPlayer.keys()]) if (!kept.has(playerIndex)) this.byPlayer.delete(playerIndex);
  }

  seeing(cameras: readonly WatchingCamera[], source: Point2): ScreenEffects[] {
    return cameras.filter((camera) => rectSees(camera.rect, source, SCREEN_EFFECT_SOURCE_MARGIN_PX)).map((camera) => this.of(camera.playerIndex));
  }
}
