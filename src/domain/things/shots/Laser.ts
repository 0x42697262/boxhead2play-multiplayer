import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { VisualKind, type Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { BulletAffect } from '../affects/BulletAffect.ts';
import { lineVisual } from '../clipVisual.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Shot } from './Shot.ts';
import { LASER_CORE_LINE, LASER_GLOW_LINE, LASER_LENGTH_CELLS, LINE_SHOT_ALPHA, LINE_SHOT_RADIUS } from './tuning.ts';

export class Laser extends Shot {
  readonly classId = ThingClass.ShotLaser;
  readonly destination: Position;
  readonly alpha = LINE_SHOT_ALPHA;
  life = Number.NaN;
  private fired = false;

  constructor(world: WorldContext, position: Position, angle: Angle, parent: Thing | undefined, damage: number) {
    super(world, position, angle, parent, damage);
    this.destination = this.position.add(this.angle.delta.scale(LASER_LENGTH_CELLS));
  }

  process(): void {
    if (!this.fired) {
      this.fired = true;
      this.fireLine();
    }
    if (--this.life === 0) this.delete();
  }

  override visual(): Visual {
    return {
      kind: VisualKind.Group,
      items: [LASER_GLOW_LINE, LASER_CORE_LINE].map(({ thickness, color, alphaFactor }) =>
        lineVisual(this.position, this.destination, { thickness, color, alpha: this.alpha * alphaFactor }),
      ),
    };
  }

  private fireLine(): void {
    const { map, settings } = this.world;
    if (settings.detail) map.mapwho.moveThing(this);
    const hit = map.collide.collideLine(this, this.position, this.destination, LINE_SHOT_RADIUS, AffectType.Bullet, true);
    if (hit) {
      this.destination.x = hit.poi.x;
      this.destination.y = hit.poi.y;
    }
    map.affects.affectLine(this, this.position, this.destination, LINE_SHOT_RADIUS, new BulletAffect(this.parent, this, this.damage, this.angle));
  }
}
