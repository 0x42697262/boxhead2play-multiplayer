import type { Visual } from '../../visuals.ts';
import { AffectType } from '../affects/AffectType.ts';
import { BulletAffect } from '../affects/BulletAffect.ts';
import { lineVisual } from '../clipVisual.ts';
import { ThingClass } from '../ThingClass.ts';
import { LineShot } from './LineShot.ts';
import { DLASER_CORE_LINE, DLASER_GLOW_LINE, LINE_SHOT_RADIUS, RAILGUN_LINE } from './tuning.ts';
import { VisualKind } from '../../visuals.ts';

export abstract class PiercingShot extends LineShot {
  protected fireLine(): void {
    const { map } = this.world;
    map.mapwho.moveThing(this);
    const hit = map.collide.collideLine(this, this.position, this.destination, LINE_SHOT_RADIUS, AffectType.Bullet, true);
    if (hit) {
      this.destination.x = hit.poi.x;
      this.destination.y = hit.poi.y;
    }
    map.affects.affectLine(this, this.position, this.destination, LINE_SHOT_RADIUS, new BulletAffect(this.parent, this, this.damage, this.angle));
  }
}

export class RailgunShot extends PiercingShot {
  readonly classId = ThingClass.ShotRailgun;

  override visual(): Visual {
    const { thickness, color, alphaFactor } = RAILGUN_LINE;
    return lineVisual(this.position, this.destination, { thickness, color, alpha: this.alpha * alphaFactor });
  }
}

export class DLaser extends PiercingShot {
  readonly classId = ThingClass.ShotDLaser;

  override visual(): Visual {
    return {
      kind: VisualKind.Group,
      items: [DLASER_GLOW_LINE, DLASER_CORE_LINE].map(({ thickness, color, alphaFactor }) =>
        lineVisual(this.position, this.destination, { thickness, color, alpha: this.alpha * alphaFactor }),
      ),
    };
  }
}
