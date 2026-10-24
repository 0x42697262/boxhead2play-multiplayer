import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { clamp } from '../../math/scalar.ts';
import { SoundId } from '../../sounds.ts';
import { Explosion } from '../effects/Explosion.ts';
import { SmartBombEffect } from '../effects/SmartBombEffect.ts';
import { Barrel } from '../objects/Barrel.ts';
import { ChargePack } from '../objects/ChargePack.ts';
import { Mine } from '../objects/Mine.ts';
import { Wall } from '../objects/Wall.ts';
import { GrenadeShot } from '../shots/GrenadeShot.ts';
import { RocketShot } from '../shots/Missile.ts';
import { GRENADE as GRENADE_THROW } from '../shots/tuning.ts';
import type { Thing } from '../Thing.ts';
import { BARREL, CHARGE_PACK, FAKE_WALL, GRENADE, MAX_OBJECTS_IN_PLACEMENT_CELL, MINE, ROCKET, SMART_BOMB, SMART_BOMB_LIFE } from './tuning.ts';
import { Weapon, type WeaponHolder } from './Weapon.ts';

function armExplosion(weapon: Weapon, position: Position, angle: Angle): Explosion {
  const explosion = new Explosion(weapon.world, position, angle, weapon.holder, weapon.damage);
  explosion.clusterExplode = weapon.clusterExplode;
  explosion.biggerBang = weapon.biggerBang;
  return explosion;
}

function placementCellFree(weapon: Weapon, position: Position): boolean {
  const cell = weapon.world.map.cellAt(position.x, position.y);
  return cell !== undefined && cell.childCount <= MAX_OBJECTS_IN_PLACEMENT_CELL;
}

export class RocketWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, ROCKET);
  }

  protected fire(position: Position, angle: Angle): void {
    this.decrementAmmo();
    const start = position.clone();
    const rocket = this.world.things.add(new RocketShot(this.world, start, angle, this.holder, this.damage));
    rocket.effect = armExplosion(this, start, angle);
    this.playSound(SoundId.RocketFire);
  }
}

export class GrenadeWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, GRENADE);
  }

  protected fire(position: Position, angle: Angle, pressedTick: number): void {
    const start = position.clone();
    const heldSeconds = (this.world.tick - pressedTick) / this.world.ticksPerSecond;
    const power = clamp(heldSeconds, GRENADE_THROW.minPower, GRENADE_THROW.maxPower);
    const grenade = this.world.things.add(new GrenadeShot(this.world, start, angle, this.holder, this.damage, power));
    grenade.effect = armExplosion(this, start, angle);
    this.decrementAmmo();
  }
}

abstract class PlacingWeapon extends Weapon {
  protected fire(position: Position, angle: Angle): void {
    const spot = position.clone();
    if (!placementCellFree(this, spot)) return;
    this.world.things.add(this.place(spot, angle));
    this.decrementAmmo();
    this.playSound(this.placeSound());
  }

  protected abstract place(position: Position, angle: Angle): Thing;
  protected abstract placeSound(): SoundId;
}

export class MineWeapon extends PlacingWeapon {
  constructor(holder: WeaponHolder) {
    super(holder, MINE);
  }

  protected place(position: Position, angle: Angle): Thing {
    return new Mine(this.world, position, angle, this.holder, this.damage);
  }

  protected placeSound(): SoundId {
    return SoundId.MinePlace;
  }
}

export class BarrelWeapon extends PlacingWeapon {
  constructor(holder: WeaponHolder) {
    super(holder, BARREL);
  }

  protected place(position: Position, angle: Angle): Thing {
    return new Barrel(this.world, position, angle, this.holder, this.damage);
  }

  protected placeSound(): SoundId {
    return SoundId.BarrelPlace;
  }
}

export class FakeWallWeapon extends PlacingWeapon {
  constructor(holder: WeaponHolder) {
    super(holder, FAKE_WALL);
  }

  protected place(position: Position, angle: Angle): Thing {
    return new Wall(this.world, position, angle, this.holder);
  }

  protected placeSound(): SoundId {
    return SoundId.BarrelPlace;
  }
}

export class ChargePackWeapon extends Weapon {
  detonate = false;
  private readonly isOwnPack = (thing: Thing): thing is ChargePack => thing instanceof ChargePack && thing.parent === this.holder;

  constructor(holder: WeaponHolder) {
    super(holder, CHARGE_PACK);
  }

  placedPacks(): ChargePack[] {
    const packs: ChargePack[] = [];
    for (const thing of this.world.things.newestFirst()) {
      if (this.isOwnPack(thing)) packs.push(thing);
    }
    return packs;
  }

  hasPlacedPacks(): boolean {
    return this.world.things.some(this.isOwnPack);
  }

  override isEmpty(): boolean {
    return !this.hasPlacedPacks() && this.ammo <= 0;
  }

  override reset(): void {
    super.reset();
    this.detonate = this.hasPlacedPacks() && this.ammo <= 0;
  }

  protected fire(position: Position, angle: Angle): void {
    if (this.detonate) {
      for (const pack of this.placedPacks()) pack.detonateRequested = true;
      this.detonate = false;
      return;
    }
    this.playSound(SoundId.MinePlace);
    const spot = position.clone();
    if (!placementCellFree(this, spot)) return;
    this.world.things.add(new ChargePack(this.world, spot, angle, this.holder, this.damage));
    this.detonate = true;
    this.decrementAmmo();
  }
}

export class SmartBombWeapon extends Weapon {
  constructor(holder: WeaponHolder) {
    super(holder, SMART_BOMB);
  }

  protected fire(): void {
    this.world.things.add(new SmartBombEffect(this.world, this.holder.position, this.holder, SMART_BOMB_LIFE));
    this.decrementAmmo();
  }
}
