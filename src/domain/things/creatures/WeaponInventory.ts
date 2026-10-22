import { MessageTone } from '../../events.ts';
import { PLAYER_WEAPON_ORDER, WeaponName } from '../../weapons/WeaponName.ts';
import { GameMode } from '../../world/GameMode.ts';
import { createWeapon } from '../weapons/createWeapon.ts';
import type { Weapon, WeaponHolder } from '../weapons/Weapon.ts';
import { WEAPON_TEXT } from '../weapons/weaponText.ts';

export interface WeaponSlot {
  readonly index: number;
  readonly name: WeaponName;
  readonly keyId: number;
  weapon: Weapon | undefined;
  active: boolean;
}

export interface InventoryOwner extends WeaponHolder {
  readonly playerIndex: number;
  life: number;
  maxLife: number;
}

const SELECT_KEY_COUNT = 10;
const LIFE_PICKUP = 'life';
const PICKUP_AMMO_WEIGHT = 0.75;
const PICKUP_BASE_WEIGHT = 0.25;

interface PickupChance {
  readonly name: WeaponName | typeof LIFE_PICKUP;
  readonly upTo: number;
}

export class WeaponInventory {
  private slotList: WeaponSlot[] = [];
  private currentSlot: WeaponSlot | undefined = undefined;

  constructor(private readonly owner: InventoryOwner) {}

  get slots(): readonly WeaponSlot[] {
    return this.slotList;
  }

  get current(): Weapon | undefined {
    return this.currentSlot?.weapon;
  }

  get currentName(): WeaponName | undefined {
    return this.currentSlot?.name;
  }

  slot(name: WeaponName): WeaponSlot | undefined {
    return this.slotList.find((slot) => slot.name === name);
  }

  init(): void {
    this.slotList = PLAYER_WEAPON_ORDER.map((name, index) => ({
      index,
      name,
      keyId: (index + 1) % SELECT_KEY_COUNT,
      weapon: undefined,
      active: false,
    }));
    this.newWeapon(WeaponName.Pistol);
  }

  newWeapon(name: WeaponName): void {
    const slot = this.slot(name);
    if (!slot) return;
    slot.active = true;
    this.addWeapon(slot);
  }

  select(name: WeaponName): void {
    const slot = this.slot(name);
    const weapon = slot?.weapon;
    if (!slot || !weapon || weapon.isEmpty() || !slot.active) return;
    const previous = this.currentSlot?.name;
    this.currentSlot = slot;
    if (previous !== name && this.owner.world.settings.gameMode === GameMode.Single) {
      this.owner.world.hud.addMessage(MessageTone.Info, { key: WEAPON_TEXT[name].selected }, this.owner.playerIndex);
    }
    weapon.reset();
  }

  next(): WeaponSlot | undefined {
    return this.cycle(1);
  }

  previous(): WeaponSlot | undefined {
    return this.cycle(-1);
  }

  reset(): void {
    for (const slot of this.slotList) {
      if (slot.name !== WeaponName.Pistol) slot.weapon?.emptyWeapon();
    }
    this.select(WeaponName.Pistol);
  }

  randomPickup(): boolean {
    const chances: PickupChance[] = [];
    let total = 0;
    for (const slot of this.slotList.slice().reverse()) {
      if (!slot.active || slot.name === WeaponName.Pistol || !slot.weapon) continue;
      total += (1 - slot.weapon.ammo / slot.weapon.totalAmmo) * PICKUP_AMMO_WEIGHT + PICKUP_BASE_WEIGHT;
      chances.push({ name: slot.name, upTo: total });
    }
    const { owner } = this;
    if (owner.life < owner.maxLife) {
      total += (1 - owner.life / owner.maxLife) * total;
      chances.push({ name: LIFE_PICKUP, upTo: total });
    }
    const roll = owner.world.rng.next() * total;
    const chosen = chances.find((chance) => roll < chance.upTo);
    if (!chosen) return false;
    if (chosen.name === LIFE_PICKUP) {
      owner.world.hud.addMessage(MessageTone.Info, { key: 'hud.lifeUp' }, owner.playerIndex);
      owner.life = owner.maxLife;
      return true;
    }
    const slot = this.slot(chosen.name);
    if (slot) this.addWeapon(slot);
    owner.world.hud.addMessage(MessageTone.Info, { key: WEAPON_TEXT[chosen.name].pickedUp }, owner.playerIndex);
    return true;
  }

  private addWeapon(slot: WeaponSlot): void {
    slot.weapon?.dispose();
    slot.weapon = createWeapon(slot.name, this.owner);
  }

  private cycle(step: number): WeaponSlot | undefined {
    const from = this.currentSlot?.index ?? 0;
    const count = this.slotList.length;
    for (let offset = 1; offset < count; offset++) {
      const slot = this.slotList[(from + step * offset + count) % count];
      if (slot?.active && slot.weapon && !slot.weapon.isEmpty()) return slot;
    }
    return undefined;
  }
}
