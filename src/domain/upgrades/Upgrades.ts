import { MessageTone, DomainEventType, type EventSink } from '../events.ts';
import type { HudState } from '../hud/HudState.ts';
import { SoundId } from '../sounds.ts';
import type { PlayerThing } from '../things/PlayerThing.ts';
import { ThingClass } from '../things/ThingClass.ts';
import { INFINITE_AMMO, type WeaponName } from '../weapons/WeaponName.ts';
import { GameMode } from '../world/GameMode.ts';
import type { SimulationSettings } from '../world/SimulationSettings.ts';
import type { TextKey } from '../../text/i18n.ts';
import type { UpgradableCreature, UpgradableObject, UpgradableWeapon, WeaponStats } from './contracts.ts';
import { buildLevels, MULTIPLIER_UPGRADES, UpgradeKind, type LevelDefinition, type MultiplierUpgrade } from './tables.ts';
import {
  AMMO_FACTOR,
  BIG_BANG_LEVEL,
  BIGGER_BANG_LEVEL,
  CLUSTER_EXPLODE_LEVEL,
  DAMAGE_FACTOR,
  DEATHMATCH_START,
  DEVIL_COUNTDOWN_STEP_ONLY_DEVILS,
  DEVIL_COUNTDOWN_STEP_WITH_ZOMBIES,
  DIFFICULTY_START,
  FIRST_LEVEL,
  INFINITE_RANGE_CELLS,
  LEVEL_COUNT,
  LONG_SHOT_FACTOR,
  MAX_LIVE_ZOMBIES_DETAIL,
  MAX_LIVE_ZOMBIES_LOW,
  MULTIPLE_KILL_IDLE_TICKS,
  MULTIPLE_KILL_TIMER_DIVISOR,
  MULTIPLIER_MAX,
  MULTIPLIER_MIN,
  MULTIPLIER_TIMER_DIVISOR,
  MULTIPLIER_TIMER_EXPONENT,
  MULTIPLIER_TIMER_LEVELS,
  MULTIPLIER_TIMER_MIN_TICKS,
  MULTIPLIER_TIMER_SECONDS,
  RAPID_FIRE_DIVISOR,
  RAPID_FIRE_MIN_RATE,
  WIDE_SHOT_LEVEL,
  WIDER_SHOT_LEVEL,
} from './tuning.ts';
import { UpgradeProp } from './UpgradeProp.ts';

export interface UpgradesHost {
  readonly settings: SimulationSettings;
  readonly ticksPerSecond: number;
  readonly hud: HudState;
  readonly events: EventSink;
  enemiesAlive(): boolean;
  spawnZombie(): boolean;
  spawnDevil(): boolean;
  players(): readonly PlayerThing[];
}

export interface LevelState {
  zombieSpawnRate: number;
  zombieCount: number;
  zombieTotalCount: number;
  devilSpawnRate: number;
  devilCount: number;
  devilTotalCount: number;
  liveZombies: number;
  liveDevils: number;
  zombieSpawnCountdown: number;
  devilSpawnCountdown: number;
}

export interface MultiplierListEntry {
  readonly index: number;
  readonly name: TextKey;
  readonly active: boolean;
  readonly newWeapon: boolean;
}

type StatValue = true | number;

interface ClassRecord {
  readonly props: Map<UpgradeProp, StatValue>;
  stamp: number | undefined;
  weapon?: WeaponStats;
  creatureSpeed?: number;
  object?: { readonly biggerBang: number; readonly clusterExplode: number };
}

interface MultiplierSlot {
  readonly upgrade: MultiplierUpgrade;
  active: boolean;
}

export class Upgrades {
  readonly level: LevelState = {
    zombieSpawnRate: 0,
    zombieCount: 0,
    zombieTotalCount: 0,
    devilSpawnRate: 0,
    devilCount: 0,
    devilTotalCount: 0,
    liveZombies: 0,
    liveDevils: 0,
    zombieSpawnCountdown: 0,
    devilSpawnCountdown: 0,
  };
  tick = 0;
  totalPlayerCount = 0;
  playerCount = 0;
  private readonly records = new Map<ThingClass, ClassRecord>();
  private readonly unlocked = new Set<WeaponName>();
  private readonly levels: readonly LevelDefinition[];
  private readonly slots: readonly MultiplierSlot[];
  private nextStamp = 0;
  private levelIndex = FIRST_LEVEL;
  private multiplierIndex = MULTIPLIER_MIN;
  private multiplierTick = 0;
  private multiplierTickTotal = 0;
  private multipleKillIndex = 0;
  private multipleKillTick = 0;
  private multipleKillTickTotal = 0;

  constructor(private readonly host: UpgradesHost) {
    this.levels = buildLevels(host.ticksPerSecond, host.settings.devilsActive);
    this.slots = MULTIPLIER_UPGRADES.map((upgrade) => ({ upgrade, active: false }));
    this.applyLevel(FIRST_LEVEL, false);
    this.setMultiplier(0);
    this.setMultipleKill(0);
  }

  get levelNumber(): number {
    return this.levelIndex;
  }

  get multiplier(): number {
    return this.multiplierIndex;
  }

  get unlockedWeapons(): readonly WeaponName[] {
    return [...this.unlocked];
  }

  get multipleKill(): number {
    return this.multipleKillIndex;
  }

  get multiplierTickRatio(): number {
    return this.multiplierIndex !== MULTIPLIER_MIN ? this.multiplierTick / this.multiplierTickTotal : 0;
  }

  get multipleKillRatio(): number {
    return this.multipleKillIndex !== 0 ? this.multipleKillTick / this.multipleKillTickTotal : 0;
  }

  process(): void {
    if (this.host.settings.gameMode === GameMode.DeathMatch) return;
    this.tick++;
    const level = this.level;
    if (level.zombieCount <= 0 && level.devilCount <= 0 && !this.host.enemiesAlive()) {
      this.applyLevel(this.levelIndex + 1, true);
      this.host.events.emit({ type: DomainEventType.SoundRequested, sound: SoundId.Click });
    } else {
      this.spawnEnemies();
    }
    if (this.multipleKillTick-- < 0) this.setMultipleKill(0);
    if (this.multiplierTick-- < 0) this.setMultiplier(this.multiplierIndex - 1);
  }

  setDifficulty(difficulty: number): void {
    const start =
      this.host.settings.gameMode === GameMode.DeathMatch
        ? DEATHMATCH_START
        : (DIFFICULTY_START[difficulty] ?? DIFFICULTY_START[0]);
    const hud = this.host.hud;
    hud.silentMessages = true;
    for (let i = 1; i < start.level; i++) this.applyLevel(this.levelIndex + 1, true);
    for (let i = 1; i < start.multiplier; i++) this.setMultiplier(this.multiplierIndex + 1);
    hud.silentMessages = false;
  }

  zombieSpawned(): void {
    this.setLiveZombies(this.level.liveZombies + 1);
  }

  zombieKilled(): void {
    this.setLiveZombies(this.level.liveZombies - 1);
  }

  devilSpawned(): void {
    this.setLiveDevils(this.level.liveDevils + 1);
  }

  devilKilled(): void {
    this.setLiveDevils(this.level.liveDevils - 1);
  }

  logKills(count: number): void {
    for (let i = 0; i < count; i++) {
      this.setMultipleKill(this.multipleKillIndex + 1);
      this.setMultiplier(this.multiplierIndex + 1);
    }
  }

  multiplierList(): MultiplierListEntry[] {
    return this.slots
      .slice()
      .sort((a, b) => a.upgrade.index - b.upgrade.index)
      .map(({ upgrade, active }) => ({
        index: upgrade.index,
        name: upgrade.name,
        active,
        newWeapon: upgrade.kind === UpgradeKind.NewWeapon,
      }));
  }

  hasUpgrade(target: ThingClass, prop: UpgradeProp): boolean {
    return this.records.get(target)?.props.has(prop) ?? false;
  }

  multiplierTicks(index: number): number {
    const remaining = MULTIPLIER_TIMER_LEVELS - (Math.min(index, MULTIPLIER_TIMER_LEVELS) - 1);
    const scale = this.host.ticksPerSecond * MULTIPLIER_TIMER_SECONDS - MULTIPLIER_TIMER_MIN_TICKS;
    return (Math.pow(remaining, MULTIPLIER_TIMER_EXPONENT) / MULTIPLIER_TIMER_DIVISOR) * scale + MULTIPLIER_TIMER_MIN_TICKS;
  }

  registerWeapon(weapon: UpgradableWeapon): void {
    const record = this.record(weapon.classId);
    record.weapon ??= {
      auto: weapon.auto,
      fireRate: weapon.fireRate,
      ammo: weapon.ammo,
      totalAmmo: weapon.totalAmmo,
      damage: weapon.damage,
      wideShot: weapon.wideShot,
      biggerBang: weapon.biggerBang,
      range: weapon.range,
    };
    weapon.upgradeStamp = undefined;
    this.applyWeaponUpgrade(weapon);
  }

  applyWeaponUpgrade(weapon: UpgradableWeapon): void {
    const record = this.records.get(weapon.classId);
    if (!record || record.stamp === weapon.upgradeStamp) return;
    weapon.upgradeStamp = record.stamp;
    const original = record.weapon;
    if (!original) return;
    const has = (prop: UpgradeProp): boolean => record.props.has(prop);
    if (has(UpgradeProp.FatalDamage)) weapon.damage = original.damage * DAMAGE_FACTOR.Fatal;
    else if (has(UpgradeProp.QuadDamage)) weapon.damage = original.damage * DAMAGE_FACTOR.Quad;
    else if (has(UpgradeProp.DoubleDamage)) weapon.damage = original.damage * DAMAGE_FACTOR.Double;
    if (has(UpgradeProp.RapidFire)) {
      weapon.fireRate = Math.round(Math.max(original.fireRate / RAPID_FIRE_DIVISOR, RAPID_FIRE_MIN_RATE));
      weapon.fireRateCount = 0;
      weapon.auto = true;
    } else if (has(UpgradeProp.FastFire)) {
      weapon.auto = true;
    }
    if (has(UpgradeProp.BiggerBang)) weapon.biggerBang = BIGGER_BANG_LEVEL;
    else if (has(UpgradeProp.BigBang)) weapon.biggerBang = BIG_BANG_LEVEL;
    if (has(UpgradeProp.ClusterExplode)) weapon.clusterExplode = CLUSTER_EXPLODE_LEVEL;
    if (has(UpgradeProp.WiderShot)) weapon.wideShot = WIDER_SHOT_LEVEL;
    else if (has(UpgradeProp.WideShot)) weapon.wideShot = WIDE_SHOT_LEVEL;
    if (has(UpgradeProp.InfinateAmmo)) {
      weapon.totalAmmo = INFINITE_AMMO;
      weapon.ammo = INFINITE_AMMO;
    } else if (has(UpgradeProp.QuadAmmo)) {
      weapon.totalAmmo = original.totalAmmo * AMMO_FACTOR.Quad;
      weapon.ammo = original.ammo * AMMO_FACTOR.Quad;
    } else if (has(UpgradeProp.DoubleAmmo)) {
      weapon.totalAmmo = original.totalAmmo * AMMO_FACTOR.Double;
      weapon.ammo = original.ammo * AMMO_FACTOR.Double;
    }
    if (has(UpgradeProp.HomingMissiles)) weapon.homingMissiles = true;
    if (has(UpgradeProp.InfinateRange)) weapon.range = INFINITE_RANGE_CELLS;
    else if (has(UpgradeProp.LongShot)) weapon.range = original.range * LONG_SHOT_FACTOR;
  }

  registerCreature(creature: UpgradableCreature): void {
    const record = this.record(creature.classId);
    record.creatureSpeed ??= creature.speed;
    creature.upgradeStamp = undefined;
    if (creature.classId !== ThingClass.Player) this.applyCreatureUpgrade(creature);
  }

  applyCreatureUpgrade(creature: UpgradableCreature): void {
    const record = this.records.get(creature.classId);
    if (!record || record.stamp === creature.upgradeStamp) return;
    creature.upgradeStamp = record.stamp;
    const speedUp = record.props.get(UpgradeProp.SpeedUp);
    creature.speed = (record.creatureSpeed ?? creature.speed) * (typeof speedUp === 'number' ? speedUp : 1);
  }

  registerObject(object: UpgradableObject): void {
    const record = this.record(object.classId);
    record.object ??= { biggerBang: object.biggerBang, clusterExplode: object.clusterExplode };
    object.upgradeStamp = undefined;
    this.applyObjectUpgrade(object);
  }

  applyObjectUpgrade(object: UpgradableObject): void {
    const record = this.records.get(object.classId);
    if (!record || record.stamp === object.upgradeStamp) return;
    object.upgradeStamp = record.stamp;
    if (record.props.has(UpgradeProp.BiggerBang)) object.biggerBang = BIGGER_BANG_LEVEL;
    else if (record.props.has(UpgradeProp.BigBang)) object.biggerBang = BIG_BANG_LEVEL;
    if (record.props.has(UpgradeProp.ClusterExplode)) object.clusterExplode = CLUSTER_EXPLODE_LEVEL;
  }

  playerRespawned(): void {
    this.playerCount++;
  }

  private spawnEnemies(): void {
    const level = this.level;
    const cap = this.host.settings.detail ? MAX_LIVE_ZOMBIES_DETAIL : MAX_LIVE_ZOMBIES_LOW;
    if (level.liveZombies < Math.min(level.zombieCount, cap) && level.zombieSpawnCountdown-- <= 0) {
      if (this.host.spawnZombie()) level.zombieSpawnCountdown = level.zombieSpawnRate;
    }
    if (level.liveDevils < level.devilCount) {
      const step = level.zombieCount !== 0 ? DEVIL_COUNTDOWN_STEP_WITH_ZOMBIES : DEVIL_COUNTDOWN_STEP_ONLY_DEVILS;
      level.devilSpawnCountdown -= step;
      if (level.devilSpawnCountdown <= 0 && this.host.spawnDevil()) level.devilSpawnCountdown = level.devilSpawnRate;
    }
  }

  private applyLevel(index: number, announce: boolean): void {
    this.levelIndex = index;
    const definition = this.levels[Math.min(index, LEVEL_COUNT) - 1];
    if (definition) {
      const level = this.level;
      level.zombieSpawnRate = definition.zombieSpawnRate;
      level.zombieCount = definition.zombieCount;
      level.zombieTotalCount = definition.zombieTotalCount;
      this.addStat(ThingClass.Zombie, UpgradeProp.SpeedUp, definition.zombieSpeedUp);
      if (definition.devil) {
        level.devilSpawnRate = definition.devil.spawnRate;
        level.devilCount = definition.devil.count;
        level.devilTotalCount = definition.devil.totalCount;
        this.addStat(ThingClass.Devil, UpgradeProp.SpeedUp, definition.devil.speedUp);
      }
    }
    this.level.liveZombies = 0;
    this.level.liveDevils = 0;
    this.level.zombieSpawnCountdown = this.level.zombieSpawnRate;
    this.level.devilSpawnCountdown = this.level.devilSpawnRate;
    if (!announce) return;
    this.host.hud.addMessage(MessageTone.Level, {
      key: index <= LEVEL_COUNT ? 'hud.level' : 'hud.levelForever',
      params: { level: index },
    });
  }

  private setLiveZombies(count: number): void {
    const level = this.level;
    const change = count - level.liveZombies;
    if (change < 0) {
      level.zombieTotalCount += change;
      if (level.zombieTotalCount < level.zombieCount) level.zombieCount = level.zombieTotalCount;
      this.logKills(1);
    }
    level.liveZombies = count;
  }

  private setLiveDevils(count: number): void {
    const level = this.level;
    const change = count - level.liveDevils;
    if (change < 0) {
      level.devilTotalCount += change;
      if (level.devilTotalCount < level.devilCount) level.devilCount = level.devilTotalCount;
      this.logKills(1);
    }
    level.liveDevils = count;
  }

  private setMultipleKill(value: number): void {
    this.multipleKillIndex = Math.max(value, 0);
    this.multipleKillTickTotal = this.multipleKillIndex
      ? this.multiplierTicks(this.multipleKillIndex) / MULTIPLE_KILL_TIMER_DIVISOR
      : MULTIPLE_KILL_IDLE_TICKS;
    this.multipleKillTick = this.multipleKillTickTotal;
  }

  private setMultiplier(value: number): void {
    this.multiplierIndex = Math.min(Math.max(value, MULTIPLIER_MIN), MULTIPLIER_MAX);
    this.multiplierTickTotal = this.multiplierTicks(this.multiplierIndex);
    this.multiplierTick = this.multiplierTickTotal;
    if (value <= MULTIPLIER_MIN) return;
    for (const slot of this.slots) {
      if (slot.upgrade.index !== this.multiplierIndex || slot.active) continue;
      this.applyMultiplierUpgrade(slot.upgrade);
      slot.active = true;
    }
  }

  private applyMultiplierUpgrade(upgrade: MultiplierUpgrade): void {
    if (upgrade.kind === UpgradeKind.NewWeapon) {
      this.nextStamp++;
      this.unlockWeapon(upgrade.weapon);
    } else {
      this.addStat(upgrade.target, upgrade.prop, true);
    }
    this.host.hud.addMessage(MessageTone.Upgrade, { key: upgrade.name });
  }

  private unlockWeapon(weapon: WeaponName): void {
    this.unlocked.add(weapon);
    for (const player of this.host.players()) player.newWeapon(weapon);
  }

  private addStat(target: ThingClass, prop: UpgradeProp, value: StatValue): void {
    const record = this.record(target);
    record.props.set(prop, value);
    record.stamp = this.nextStamp++;
  }

  private record(target: ThingClass): ClassRecord {
    let record = this.records.get(target);
    if (!record) {
      record = { props: new Map(), stamp: undefined };
      this.records.set(target, record);
    }
    return record;
  }
}
