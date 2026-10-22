import { SHOT_HIT_WALL_SOUNDS } from '../../sounds.ts';
import type { Visual } from '../../visuals.ts';
import { AffectType } from '../affects/AffectType.ts';
import { BulletAffect } from '../affects/BulletAffect.ts';
import { lineVisual } from '../clipVisual.ts';
import { BulletHit } from '../effects/BulletHit.ts';
import { LineHitKind } from '../../map/MapCell.ts';
import { ThingClass } from '../ThingClass.ts';
import { LineShot } from './LineShot.ts';
import { BULLET_HIT_EFFECT_CHANCE, BULLET_LINE, LINE_SHOT_RADIUS } from './tuning.ts';

export class Bullet extends LineShot {
  readonly classId = ThingClass.ShotBullet;

  override visual(): Visual {
    return lineVisual(this.position, this.destination, { ...BULLET_LINE, alpha: this.alpha });
  }

  protected fireLine(): void {
    const { world } = this;
    world.map.mapwho.moveThing(this);
    const hit = world.map.collide.collideLine(this, this.position, this.destination, LINE_SHOT_RADIUS, AffectType.Bullet);
    if (!hit) return;
    this.destination.x = hit.poi.x;
    this.destination.y = hit.poi.y;
    if (hit.kind === LineHitKind.Thing) hit.thing.affect(new BulletAffect(this.parent, this, this.damage, this.angle));
    if (world.rng.int(BULLET_HIT_EFFECT_CHANCE) === 0 && world.settings.detail) {
      world.things.add(new BulletHit(world, this.destination.clone()));
    }
    const sound = SHOT_HIT_WALL_SOUNDS[world.rng.int(SHOT_HIT_WALL_SOUNDS.length)];
    if (sound) this.playSound(sound);
  }
}
