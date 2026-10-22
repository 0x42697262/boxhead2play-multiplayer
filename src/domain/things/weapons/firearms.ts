import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { SoundId } from '../../sounds.ts';
import { ClipSymbol } from '../clipVisual.ts';
import { MuzzleFlash } from '../effects/MuzzleFlash.ts';
import { Bullet } from '../shots/Bullet.ts';
import { DevastatorShot } from '../shots/DevastatorShot.ts';
import { RailgunShot } from '../shots/PiercingShot.ts';
import {
  DEGREES_PER_HALF_TURN,
  DEVASTATOR,
  PISTOL,
  PISTOL_BULLET_RANGE,
  RAILGUN,
  SHOTGUN,
  SHOTGUN_SPREAD_DEGREES,
  SHOTGUN_WIDE_PAIRS,
  UZI,
} from './tuning.ts';
import { Weapon, type WeaponHolder } from './Weapon.ts';

export class PistolWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, PISTOL);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    this.world.things.add(new MuzzleFlash(this.world, position.clone(), angle, ClipSymbol.PistolMuzzleFlash));
    this.world.things.add(new Bullet(this.world, position, angle, this.holder, this.damage, PISTOL_BULLET_RANGE));
    this.playSound(SoundId.PistolFire);
  }
}

export class UziWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, UZI);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    this.world.things.add(new MuzzleFlash(this.world, position.clone(), angle, ClipSymbol.UziMuzzleFlash));
    this.world.things.add(new Bullet(this.world, position, angle, this.holder, this.damage, this.range));
    this.playSound(SoundId.UziFire);
  }
}

export class ShotgunWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, SHOTGUN);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    const { world } = this;
    world.things.add(new MuzzleFlash(world, position.clone(), angle, ClipSymbol.ShotgunMuzzleFlash));
    this.playSound(SoundId.ShotgunFire);
    world.things.add(new Bullet(world, position.clone(), angle, this.holder, this.damage, this.range));
    const spread = SHOTGUN_SPREAD_DEGREES * (this.wideShot + 1);
    const lastPair = this.wideShot ? SHOTGUN_WIDE_PAIRS : 0;
    let offset = spread;
    for (let pair = 0; pair <= lastPair; pair++) {
      const radians = (offset * Math.PI) / DEGREES_PER_HALF_TURN;
      const delayed = pair >= 1;
      world.things.add(new Bullet(world, position.clone(), new Angle(angle.radians - radians), this.holder, this.damage, this.range, delayed));
      world.things.add(new Bullet(world, position.clone(), new Angle(angle.radians + radians), this.holder, this.damage, this.range, delayed));
      offset += spread;
    }
  }
}

export class RailgunWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, RAILGUN);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    this.world.things.add(new MuzzleFlash(this.world, position.clone(), angle, ClipSymbol.RailgunMuzzleFlash));
    this.world.things.add(new RailgunShot(this.world, position, angle, this.holder, this.damage, this.range));
    this.playSound(SoundId.RailgunFire);
  }
}

export class DevastatorWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, DEVASTATOR);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    this.world.things.add(new DevastatorShot(this.world, position, angle, this.holder, this.damage));
  }
}
