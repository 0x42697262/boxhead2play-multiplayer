import type { Angle } from '../../math/Angle.ts';
import { Position } from '../../math/Position.ts';
import { CELL_SIZE_PX } from '../../map/tuning.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import type { Thing } from '../Thing.ts';
import { Shot } from './Shot.ts';
import {
  DEFAULT_SHOT_RANGE,
  LINE_SHOT_ALPHA,
  LINE_SHOT_DECAY,
  LINE_SHOT_DESTINATION_FOLLOW,
  LINE_SHOT_JITTER_CHOICES,
  LINE_SHOT_JITTER_MIN_PX,
  LINE_SHOT_LIFE_TICKS,
} from './tuning.ts';

const LinePhase = {
  Delayed: 'delayed',
  Init: 'init',
  Fading: 'fading',
} as const;

type LinePhase = (typeof LinePhase)[keyof typeof LinePhase];

export abstract class LineShot extends Shot {
  readonly destination: Position;
  readonly alpha = LINE_SHOT_ALPHA;
  life = LINE_SHOT_LIFE_TICKS;
  private phase: LinePhase;

  constructor(world: WorldContext, position: Position, angle: Angle, parent: Thing | undefined, damage: number, range = DEFAULT_SHOT_RANGE, delayed = false) {
    super(world, position, angle, parent, damage);
    this.destination = this.position.add(new Position(1, 0, 0).rotateZ(this.angle.radians).normalize(range));
    const jitterY = (world.rng.int(LINE_SHOT_JITTER_CHOICES) + LINE_SHOT_JITTER_MIN_PX) / CELL_SIZE_PX;
    const jitterZ = (world.rng.int(LINE_SHOT_JITTER_CHOICES) + LINE_SHOT_JITTER_MIN_PX) / CELL_SIZE_PX;
    this.delta = new Position(0, jitterY, jitterZ).rotateZ(this.angle.radians);
    this.phase = delayed ? LinePhase.Delayed : LinePhase.Init;
  }

  get hasFired(): boolean {
    return this.phase === LinePhase.Fading;
  }

  process(): void {
    if (this.phase === LinePhase.Delayed) {
      this.phase = LinePhase.Init;
      return;
    }
    if (this.phase === LinePhase.Init) {
      this.phase = LinePhase.Fading;
      this.fireLine();
    }
    this.fade();
  }

  protected abstract fireLine(): void;

  private fade(): void {
    this.delta.scale(LINE_SHOT_DECAY);
    this.destination.x += this.delta.x * LINE_SHOT_DESTINATION_FOLLOW;
    this.destination.y += this.delta.y * LINE_SHOT_DESTINATION_FOLLOW;
    this.destination.z += this.delta.z * LINE_SHOT_DESTINATION_FOLLOW;
    this.position.addInPlace(this.delta);
    if (--this.life === 0) this.delete();
  }
}
