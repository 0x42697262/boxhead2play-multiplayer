import { MessageTone } from '../../events.ts';
import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import type { UpgradableWeapon } from '../../upgrades/contracts.ts';
import { INFINITE_AMMO, WeaponName } from '../../weapons/WeaponName.ts';
import { Thing } from '../Thing.ts';
import type { ThingClass } from '../ThingClass.ts';
import type { WeaponDefinition } from './tuning.ts';
import type { WeaponId } from './WeaponId.ts';
import { WEAPON_TEXT, type WeaponText } from './weaponText.ts';

export interface FireControl {
  readonly timeDown: number;
  readonly timePressed: number;
  isDown(): boolean;
  isPressed(): boolean;
  isReleased(): boolean;
}

export interface WeaponHolder extends Thing {
  selectWeapon(name: WeaponId): void;
  weaponPosition(): Position;
}

export abstract class Weapon extends Thing implements UpgradableWeapon {
  readonly classId: ThingClass;
  readonly name: WeaponId;
  auto: boolean;
  onRelease: boolean;
  fireRate: number;
  fireRateCount = 0;
  ammo: number;
  totalAmmo: number;
  damage: number;
  range: number;
  wideShot = 0;
  biggerBang = 0;
  clusterExplode = 0;
  homingMissiles = false;
  upgradeStamp: number | undefined = undefined;
  fired = false;

  constructor(
    readonly holder: WeaponHolder,
    definition: WeaponDefinition,
  ) {
    super(holder.world, holder.position, { angle: new Angle(0), parent: holder });
    this.classId = definition.classId;
    this.name = definition.id;
    this.auto = definition.auto;
    this.onRelease = definition.onRelease;
    this.fireRate = definition.fireRate;
    this.totalAmmo = this.ammo = definition.ammo;
    this.damage = definition.damage;
    this.range = definition.range;
    this.world.upgrades.registerWeapon(this);
  }

  get text(): WeaponText {
    return WEAPON_TEXT[this.name];
  }

  process(): void {
    return;
  }

  reset(): void {
    this.fireRateCount = 0;
  }

  isEmpty(): boolean {
    return this.ammo <= 0;
  }

  emptyWeapon(): void {
    this.ammo = this.totalAmmo !== INFINITE_AMMO ? 0 : this.totalAmmo;
  }

  update(key: FireControl): void {
    this.world.upgrades.applyWeaponUpgrade(this);
    if (this.isEmpty()) {
      this.world.hud.addMessage(MessageTone.Critical, { key: this.text.outOfAmmo });
      this.holder.selectWeapon(WeaponName.Pistol);
      return;
    }
    if (--this.fireRateCount > 0) return;
    this.fireRateCount = 0;
    if (this.auto) {
      this.fired = key.isDown();
      if (this.fired) this.fire(this.holder.weaponPosition(), this.holder.angle.clone(), key.timeDown);
    } else if (this.onRelease) {
      this.fired = key.isReleased();
      if (this.fired) this.fire(this.holder.weaponPosition(), this.holder.angle.clone(), key.timePressed);
    } else {
      this.fired = key.isPressed();
      if (this.fired) this.fire(this.holder.weaponPosition(), this.holder.angle.clone(), this.world.tick);
    }
  }

  protected decrementAmmo(): void {
    this.ammo -= this.totalAmmo !== INFINITE_AMMO ? 1 : 0;
    this.fireRateCount = this.fireRate;
  }

  protected abstract fire(position: Position, angle: Angle, keyTick: number): void;
}
