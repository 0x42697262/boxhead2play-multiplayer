import type { Point3 } from '../../../domain/events.ts';
import type { HudMessageEntry } from '../../../domain/hud/HudState.ts';
import type { PlayerHudStatus } from '../../../domain/things/PlayerThing.ts';
import type { MultiplierListEntry } from '../../../domain/upgrades/Upgrades.ts';
import type { DrawEntry } from '../../../domain/visuals.ts';
import type { GameMode } from '../../../domain/world/GameMode.ts';
import type { CameraView } from '../../../domain/world/World.ts';

export interface CameraFrame {
  readonly view: CameraView;
  readonly entries: readonly DrawEntry[];
}

export interface PlayerHudFrame {
  readonly playerIndex: number;
  readonly position: Point3;
  readonly status: PlayerHudStatus;
}

export interface HudFrame {
  readonly totalScore: number;
  readonly multiplier: number;
  readonly multiplierTickRatio: number;
  readonly deaths: readonly number[];
  readonly messages: readonly HudMessageEntry[];
  readonly players: readonly PlayerHudFrame[];
  readonly upgrades: readonly MultiplierListEntry[];
}

export interface WorldFrame {
  readonly gameMode: GameMode;
  readonly cameras: readonly CameraFrame[];
  readonly brightness: number;
  readonly projectionFactor: number;
  readonly paused: boolean;
  readonly tick: number;
  readonly ticksPerSecond: number;
  readonly hud: HudFrame;
}
