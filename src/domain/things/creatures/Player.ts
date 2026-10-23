import { ModelPoint } from '../../animation/AnimationCatalog.ts';
import { CharacterAnimator } from '../../animation/CharacterAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import { Position } from '../../math/Position.ts';
import { CollideFlag } from '../../map/CollideFlag.ts';
import { SoundId } from '../../sounds.ts';
import { CharacterStyle, OPAQUE_ALPHA, PLAYER_CHARACTER_STYLES, type Visual } from '../../visuals.ts';
import { INFINITE_AMMO, WeaponName } from '../../weapons/WeaponName.ts';
import { GameMode } from '../../world/GameMode.ts';
import type { PlayerCharacter } from '../../world/SimulationSettings.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import type { PlayerHudStatus, PlayerThing } from '../PlayerThing.ts';
import type { StateHandlers } from '../StateMachine.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { WEAPON_TEXT } from '../weapons/weaponText.ts';
import type { WeaponId } from '../weapons/WeaponId.ts';
import type { WeaponHolder } from '../weapons/Weapon.ts';
import { PLAYER_COLLECTION, WEAPON_ANIMATIONS } from './characterCollections.ts';
import { Creature, MoveResult } from './Creature.ts';
import { CreatureState } from './CreatureState.ts';
import { PlayerControls } from './PlayerControls.ts';
import { CORPSE_FADE_SECONDS, PLAYER } from './tuning.ts';
import { WeaponInventory, type WeaponSlot } from './WeaponInventory.ts';

const PLAYER_AFFECTS =
  AffectType.Bullet | AffectType.Explosion | AffectType.ZombieAttack | AffectType.PlayerLineOfSight | AffectType.FireBall;

export function playerStyle(character: PlayerCharacter): CharacterStyle {
  return PLAYER_CHARACTER_STYLES[character] ?? CharacterStyle.Swat;
}

export class Player extends Creature implements PlayerThing, WeaponHolder {
  readonly classId = ThingClass.Player;
  readonly controls = new PlayerControls();
  readonly inventory: WeaponInventory;
  private currentAnimation: string | undefined = undefined;

  constructor(
    world: WorldContext,
    position: Position,
    readonly playerIndex: number,
    angle: Angle,
    readonly character: PlayerCharacter,
  ) {
    super(world, position, { angle }, Player.createAnimator(world, character));
    this.inventory = new WeaponInventory(this);
  }

  private static createAnimator(world: WorldContext, character: PlayerCharacter): CharacterAnimator {
    return new CharacterAnimator(world.animations, PLAYER_COLLECTION, playerStyle(character));
  }

  get visible(): boolean {
    return !(this.invincible && this.invincible % 2) && !this.states.is(CreatureState.Respawn);
  }

  override process(): void {
    this.controls.sync(this.world.input(this.playerIndex), this.world.tick);
    super.process();
  }

  override visual(): Visual | undefined {
    return this.visible ? super.visual() : undefined;
  }

  newWeapon(name: WeaponName): void {
    this.inventory.newWeapon(name);
  }

  resetWeapons(): void {
    this.inventory.reset();
  }

  randomPickup(): boolean {
    return this.inventory.randomPickup();
  }

  selectWeapon(name: WeaponId): void {
    if (isWeaponName(name)) this.inventory.select(name);
  }

  weaponPosition(): Position {
    const gun = this.animator.modelPoint(ModelPoint.GunPositionRight, this.angle);
    return gun && !Number.isNaN(gun.x) ? this.position.add(gun) : this.position.clone();
  }

  hudStatus(): PlayerHudStatus {
    const weapon = this.inventory.current;
    const ammo = weapon?.ammo;
    return {
      lifeRatio: this.life / this.maxLife,
      weaponShortName: weapon ? weapon.text.shortName : WEAPON_TEXT.pistol.shortName,
      ammo: ammo === INFINITE_AMMO ? undefined : ammo,
      visible: this.visible && !this.hasFlag(ThingFlag.Dead),
    };
  }

  protected override processInit(): void {
    super.processInit();
    this.affectSetup(PLAYER_AFFECTS);
    this.controls.fire.renew();
    this.speed = PLAYER.speed;
    this.mass = PLAYER.mass;
    this.height = PLAYER.height;
    this.maxLife = this.life = PLAYER.life;
    this.inventory.init();
    for (const weapon of this.world.upgrades.unlockedWeapons) this.inventory.newWeapon(weapon);
    if (this.world.settings.gameMode === GameMode.DeathMatch) this.inventory.reset();
    this.inventory.select(WeaponName.Pistol);
    this.sounds.death = SoundId.PlayerScream1;
    this.world.upgrades.registerCreature(this);
    this.setState(CreatureState.PlayerControl);
    this.invincible = PLAYER.spawnInvincibleTicks;
  }

  protected override processNormal(): void {
    super.processNormal();
    this.setCollideDirection(this.position, CollideFlag.Player);
    if (!this.hasFlag(ThingFlag.Dead)) this.world.trackPlayer(this);
    if (this.invincible) this.invincible--;
  }

  protected override ownStates(): Partial<StateHandlers<CreatureState>> {
    return {
      playerControl: { enter: () => this.enterPlayerControl(), tick: () => this.tickPlayerControl() },
      dead: { enter: () => this.enterDead(), tick: () => this.tickPlayerDead() },
      respawn: { tick: () => this.tickRespawn() },
    };
  }

  private enterPlayerControl(): void {
    this.baseState = this.states.current;
    this.currentAnimation = undefined;
    this.tickPlayerControl();
  }

  private tickPlayerControl(): void {
    this.regenerate();
    const { controls } = this;
    const dx = controls.left.isDown() ? -1 : controls.right.isDown() ? 1 : 0;
    const dy = controls.up.isDown() ? -1 : controls.down.isDown() ? 1 : 0;
    this.delta = new Position(dx, dy, 0).normalize2D(this.speed);
    if (!this.delta.isZero()) this.angle.delta = this.delta;
    const moved = this.moveAndReport(this.world.map.collide.playerCollide(this));
    const animations = WEAPON_ANIMATIONS[this.inventory.currentName ?? WeaponName.Pistol];
    const animation = moved === MoveResult.None ? animations.stand : animations.walk;
    const selected = this.selectedSlot();
    if (selected) {
      controls.fire.renew();
      this.inventory.select(selected.name);
    }
    this.inventory.current?.update(controls.fire);
    if (animation !== this.currentAnimation) {
      this.currentAnimation = animation;
      this.animator.setAnimation(animation, 0);
    } else {
      this.animator.animate(this.speed * PLAYER.walkAnimationFactor);
    }
  }

  private regenerate(): void {
    if (this.life > 0 && this.life < this.maxLife) {
      this.life = Math.min(this.life + this.maxLife / (this.world.ticksPerSecond * PLAYER.regenSeconds), this.maxLife);
    }
  }

  private selectedSlot(): WeaponSlot | undefined {
    const { controls } = this;
    let selected: WeaponSlot | undefined;
    for (const slot of this.inventory.slots.slice().reverse()) {
      if (controls.select(slot.keyId)?.isReleased()) selected = slot;
    }
    if (controls.nextWeapon.isReleased()) selected = this.inventory.next();
    if (controls.prevWeapon.isReleased()) selected = this.inventory.previous();
    return selected;
  }

  private tickPlayerDead(): void {
    const fadeTicks = this.world.ticksPerSecond * CORPSE_FADE_SECONDS;
    if (this.stateCount < fadeTicks) {
      this.alpha = (this.stateCount / fadeTicks) * OPAQUE_ALPHA;
      this.world.playerDead();
    }
    if (--this.stateCount < 0) {
      this.setState(CreatureState.Respawn);
      this.stateCount = PLAYER.respawnDelayTicks;
    }
  }

  private tickRespawn(): void {
    if (--this.stateCount >= 0) return;
    const point = this.world.playerRespawnPoint(this.world.things.nearestOtherPlayer(this));
    if (!point) return;
    this.alpha = OPAQUE_ALPHA;
    this.lastAttackerIndex = undefined;
    this.animator = Player.createAnimator(this.world, this.character);
    this.affectSetup(PLAYER_AFFECTS);
    this.flags = ThingFlag.Collidable;
    this.move(point.position.clone());
    this.angle.radians = point.angle.radians;
    const factor = this.world.settings.gameMode === GameMode.DeathMatch ? PLAYER.deathMatchRespawnInvincibleFactor : PLAYER.respawnInvincibleFactor;
    this.invincible = PLAYER.respawnInvincibleTicks * factor;
    this.setState(CreatureState.PlayerControl);
    this.controls.fire.renew();
    this.maxLife = this.life = PLAYER.life;
    this.inventory.reset();
    this.inventory.select(WeaponName.Pistol);
    this.world.upgrades.playerRespawned();
  }
}

function isWeaponName(id: WeaponId): id is WeaponName {
  return (Object.values(WeaponName) as string[]).includes(id);
}
