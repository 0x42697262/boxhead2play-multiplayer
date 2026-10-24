import type { CharacterAnimator } from '../../animation/CharacterAnimator.ts';
import { Angle } from '../../math/Angle.ts';
import { ALL_DIRECTIONS, STRAIGHT_DIRECTION_STEP, wrapDirection } from '../../math/Direction.ts';
import { Position } from '../../math/Position.ts';
import { CollideFlag, CollideMask } from '../../map/CollideFlag.ts';
import type { MovingBody } from '../../map/MapCollide.ts';
import type { MapCell } from '../../map/MapCell.ts';
import { SoundId } from '../../sounds.ts';
import type { UpgradableCreature } from '../../upgrades/contracts.ts';
import { OPAQUE_ALPHA, type Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { affectorsInProcessingOrder, resolveHit, type HitTarget } from '../affects/hitReaction.ts';
import { isPlayer } from '../PlayerThing.ts';
import { StateMachine, type StateHandler, type StateHandlers } from '../StateMachine.ts';
import { rootOwner, Thing, type ThingOptions } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { CreatureAnimation, SHOT_HIT_ANIMATIONS } from './characterCollections.ts';
import { CreatureState } from './CreatureState.ts';
import {
  CELL_STEP_ANIMATION_SPEED,
  CORPSE_FADE_SECONDS,
  CORPSE_SECONDS,
  CREATURE_HEIGHT,
  CREATURE_LIFE,
  CREATURE_MASS,
  CREATURE_RADIUS,
  DIAGONAL_STEP_CELLS,
  DYING_ANIMATION_SPEED,
  HIT_RECOVERY_SLEEP_TICKS,
  KNOCKBACK_DECAY,
  KNOCKBACK_MIN_LENGTH,
  PLAYER_CORPSE_SECONDS,
  STRAIGHT_STEP_CELLS,
  TURN_LOOP_SLEEP_SECONDS_DIVISOR,
  TURN_SPEED_FACTOR,
  WAIT_SECONDS,
} from './tuning.ts';

export interface CreatureSounds {
  damage?: SoundId;
  death?: SoundId;
}

const ENEMY_AFFECTS = AffectType.Bullet | AffectType.Explosion | AffectType.FireBall;
const NO_OP_STATE: StateHandler = { tick: () => undefined };

export abstract class Creature extends Thing implements MovingBody, HitTarget, UpgradableCreature {
  readonly states: StateMachine<CreatureState>;
  life = 0;
  maxLife = 0;
  mass = CREATURE_MASS;
  speed = 0;
  alpha = OPAQUE_ALPHA;
  invincible = 0;
  delta = Position.zero();
  upgradeStamp: number | undefined = undefined;
  baseState: CreatureState = CreatureState.None;
  readonly targetAngle = new Angle(0);
  targetDirection = 0;
  hitAngle: Angle | undefined = undefined;
  lastAttackerIndex: number | undefined = undefined;
  lastAttackerClass: ThingClass | undefined = undefined;
  currentCell: MapCell | undefined = undefined;
  deathLogged = false;
  protected animator: CharacterAnimator;
  protected readonly sounds: CreatureSounds = {};
  private initialized = false;
  private angleDelta = 0;
  private animationSpeed = 0;
  private returnAngle = new Angle(0);
  private directionCell: MapCell | undefined = undefined;
  private reservedCell: MapCell | undefined = undefined;
  private reservedFlags = 0;

  constructor(world: WorldContext, position: Position, options: ThingOptions, animator: CharacterAnimator) {
    super(world, position, options);
    this.flags = ThingFlag.Collidable;
    this.animator = animator;
    this.states = new StateMachine<CreatureState>({ ...this.baseStates(), ...this.ownStates() }, CreatureState.None);
  }

  get isPlayer(): boolean {
    return this.classId === ThingClass.Player;
  }

  get state(): CreatureState {
    return this.states.current;
  }

  get stateCount(): number {
    return this.states.count;
  }

  set stateCount(count: number) {
    this.states.count = count;
  }

  get animation(): CharacterAnimator {
    return this.animator;
  }

  process(): void {
    if (this.initialized) {
      this.processNormal();
      return;
    }
    this.initialized = true;
    this.processInit();
  }

  override visual(): Visual | undefined {
    return this.animator.visual(this.position, this.angle, this.alpha);
  }

  setState(next: CreatureState): void {
    this.states.set(next);
  }

  override dispose(): void {
    this.clearCollideCell();
    super.dispose();
  }

  protected processInit(): void {
    this.setRadius(CREATURE_RADIUS);
    this.height = CREATURE_HEIGHT;
    this.move(this.position.cellCentre());
    this.maxLife = this.life = CREATURE_LIFE;
    this.processNormal();
  }

  protected processNormal(): void {
    if (this.affectors.length > 0) this.processAffects();
    this.states.tick();
  }

  protected ownStates(): Partial<StateHandlers<CreatureState>> {
    return {};
  }

  protected enemyAffectFlags(): number {
    return ENEMY_AFFECTS;
  }

  protected stateAfterEnterMap(): CreatureState {
    return CreatureState.CellToCell;
  }

  protected setStateWithDirection(next: CreatureState, current: number, target: number): void {
    if (target === current) {
      this.setState(next);
      return;
    }
    this.targetAngle.direction = wrapDirection(target);
    this.setState(CreatureState.Turn);
  }

  protected setStateWithDirectionWait(next: CreatureState, current: number, target: number): void {
    if (target === current) {
      this.setState(next);
      return;
    }
    if (this.states.previous === CreatureState.Turn) {
      this.setState(CreatureState.Sleep);
      this.stateCount = this.world.ticksPerSecond / TURN_LOOP_SLEEP_SECONDS_DIVISOR;
      return;
    }
    this.targetAngle.direction = wrapDirection(target);
    this.setState(CreatureState.Turn);
  }

  protected cellHere(): MapCell | undefined {
    return this.world.map.cellAt(this.position.x, this.position.y);
  }

  protected setCollideDirection(p: Position, flags: number): void {
    if (this.reservedCell) this.reservedCell.collide &= ~flags;
    this.reservedFlags = flags;
    this.reservedCell = this.world.map.cellAt(p.x, p.y);
    if (this.reservedCell) this.reservedCell.collide |= this.reservedFlags;
  }

  protected clearCollideCell(): void {
    if (this.reservedCell) this.reservedCell.collide &= ~this.reservedFlags;
    this.reservedCell = undefined;
  }

  protected moveAndReport(next: Position): MoveResult {
    let result: MoveResult = MoveResult.None;
    if (next !== this.position) {
      if (!next.equals(this.position)) result = MoveResult.Moved;
      this.position.set(next);
    }
    if (this.world.map.mapwho.moveThing(this)) result = MoveResult.CellMoved;
    return result;
  }

  protected checkForDead(): boolean {
    if (this.life <= 0 || this.hasFlag(ThingFlag.Dead)) {
      this.setState(CreatureState.Dying);
      return true;
    }
    return false;
  }

  protected playOptionalSound(sound: SoundId | undefined): void {
    if (sound) this.playSound(sound);
  }

  private processAffects(): void {
    this.returnAngle = this.angle.clone();
    if (!this.invincible) {
      for (const affect of affectorsInProcessingOrder(this.affectors)) {
        const reaction = resolveHit(affect, this, this.world.settings.damageActive);
        if (!reaction) continue;
        const source = rootOwner(affect.owner);
        this.lastAttackerIndex = source && isPlayer(source) ? source.playerIndex : undefined;
        this.lastAttackerClass = source?.classId;
        this.delta = reaction.delta;
        this.angle.radians = reaction.facingRadians;
        this.hitAngle = reaction.hitAngle;
        this.setState(reaction.state);
      }
    }
    this.affectors = [];
  }

  private baseStates(): StateHandlers<CreatureState> {
    const hit: StateHandler = { enter: () => this.enterHit(), tick: () => this.tickHit() };
    return {
      none: NO_OP_STATE,
      enterMap: { enter: () => this.enterEnterMap(), tick: () => this.tickEnterMap() },
      cellToCell: { enter: () => this.enterCellToCell(), tick: () => this.tickCellToCell() },
      turn: { enter: () => this.enterTurn(), tick: () => this.tickTurn() },
      turnAndMove: { enter: () => this.enterTurn(), tick: () => this.tickTurnAndMove() },
      stand: NO_OP_STATE,
      sleep: { enter: () => this.animator.setAnimation(CreatureAnimation.Stand, 0), tick: () => this.tickSleep() },
      wait: { enter: () => this.enterWait(), tick: () => this.tickWait() },
      waitToMove: { enter: () => this.enterWait(), tick: () => this.tickWaitToMove() },
      bulletHit: hit,
      explosionHit: hit,
      zombieHit: hit,
      dying: { enter: () => this.enterDying(), tick: () => this.tickDying() },
      dead: { enter: () => this.enterDead(), tick: () => this.tickDead() },
      gotoPlayer: NO_OP_STATE,
      attack: NO_OP_STATE,
      removeObject: NO_OP_STATE,
      playerControl: NO_OP_STATE,
      respawn: NO_OP_STATE,
    };
  }

  private enterEnterMap(): void {
    this.setCollideDirection(this.position, CollideFlag.Creature);
    this.flags &= ~ThingFlag.Collidable;
    this.baseState = this.states.current;
    this.currentCell = this.reservedCell;
    this.directionCell = undefined;
    if (!this.currentCell) return;
    for (const direction of ALL_DIRECTIONS) {
      if (direction % STRAIGHT_DIRECTION_STEP !== 0) continue;
      const cell = this.currentCell.adjacent(direction);
      if (!(cell.collide & CollideMask.StaticImpassable)) {
        this.angle.direction = direction;
        this.directionCell = cell;
        return;
      }
    }
  }

  private tickEnterMap(): void {
    if (this.directionCell && this.directionCell.collide & CollideFlag.Creature) {
      this.setState(CreatureState.Wait);
      return;
    }
    this.affectSetup(this.enemyAffectFlags());
    this.flags |= ThingFlag.Collidable;
    this.baseState = CreatureState.GotoPlayer;
    this.setState(this.stateAfterEnterMap());
  }

  private enterCellToCell(): void {
    const step = this.angle.directionDelta;
    this.setCollideDirection(this.position.add(step), CollideFlag.Creature);
    const count = step.x !== 0 && step.y !== 0 ? DIAGONAL_STEP_CELLS / this.speed : STRAIGHT_STEP_CELLS / this.speed;
    this.stateCount = count;
    this.delta = step.add(this.position.cellCentre().subtract(this.position)).scale(1 / count);
    this.animator.setAnimation(CreatureAnimation.Walk);
    this.animationSpeed = CELL_STEP_ANIMATION_SPEED;
  }

  private tickCellToCell(): void {
    if (--this.stateCount <= 0) {
      this.position.snapToCellCentre();
      this.world.map.mapwho.moveThing(this);
      this.setState(this.baseState);
      return;
    }
    this.animator.quickAnimate(this.animationSpeed);
    this.position.x += this.delta.x;
    this.position.y += this.delta.y;
    this.world.map.mapwho.moveThing(this);
  }

  private enterTurn(): void {
    this.angleDelta = this.speed * TURN_SPEED_FACTOR * this.angle.turnSign(this.targetAngle);
    this.stateCount = Math.abs(this.angle.difference(this.targetAngle) / this.angleDelta);
    this.animator.setAnimation(CreatureAnimation.Stand, 0);
  }

  private tickTurn(): void {
    if (--this.stateCount <= 0) {
      this.angle.radians = this.targetAngle.radians;
      this.setState(this.baseState);
      return;
    }
    this.angle.add(this.angleDelta);
  }

  private tickTurnAndMove(): void {
    if (--this.stateCount <= 0) {
      this.angle.radians = this.targetAngle.radians;
      this.setState(this.clearAhead() ? CreatureState.CellToCell : this.baseState);
      return;
    }
    this.angle.add(this.angleDelta);
  }

  private clearAhead(): boolean {
    const flags = this.cellHere()?.collideFlagsToward(this.angle.direction) ?? CollideFlag.None;
    return !(flags & CollideMask.NonMovable);
  }

  private tickSleep(): void {
    if (--this.stateCount <= 0) this.setState(this.states.previous ?? this.baseState);
  }

  private enterWait(): void {
    this.stateCount = this.world.ticksPerSecond * WAIT_SECONDS;
    this.animator.setAnimation(CreatureAnimation.Stand, 0);
  }

  private tickWait(): void {
    if (--this.stateCount <= 0) this.setState(this.baseState);
  }

  private tickWaitToMove(): void {
    const expired = --this.stateCount <= 0;
    const blocked = (this.currentCell?.collideFlagsToward(this.targetDirection) ?? CollideFlag.None) & CollideFlag.Creature;
    if (expired || !blocked) this.setState(this.clearAhead() ? CreatureState.CellToCell : this.baseState);
  }

  private enterHit(): void {
    let count = 0;
    for (let length = this.delta.length; length >= KNOCKBACK_MIN_LENGTH; length *= KNOCKBACK_DECAY) count++;
    this.stateCount = count;
    this.world.map.decals.bloodSplat(this.position);
    this.clearCollideCell();
    this.animator.setAnimation(SHOT_HIT_ANIMATIONS[this.world.rng.int(SHOT_HIT_ANIMATIONS.length)] ?? CreatureAnimation.ShotHitRear, 0);
    this.playOptionalSound(this.sounds.damage);
    if (this.world.map.collideAt(this.position.x, this.position.y) & CollideMask.StaticImpassable) this.delta.clear();
  }

  private tickHit(): void {
    const next = this.world.map.collide.creatureCollide(this);
    if (Number.isNaN(next.x)) {
      this.flags |= ThingFlag.Dead;
      this.setState(CreatureState.Dying);
      return;
    }
    this.move(next);
    this.delta.scale(KNOCKBACK_DECAY);
    if (!this.states.is(CreatureState.ExplosionHit)) this.world.map.decals.bloodSplat(this.position);
    if (this.life <= 0) {
      this.clearAffects();
      this.flags |= ThingFlag.Dead;
    }
    if (--this.stateCount < 0) {
      if (this.checkForDead()) return;
      this.angle.radians = this.returnAngle.radians;
      this.setState(CreatureState.Sleep);
      this.stateCount = HIT_RECOVERY_SLEEP_TICKS;
      this.states.previous = this.baseState;
    }
  }

  private enterDying(): void {
    this.playOptionalSound(this.sounds.death);
    this.clearCollideCell();
    this.flags &= ~ThingFlag.Collidable;
    this.clearAffects();
    this.animator.setAnimation(CreatureAnimation.Dying, 0);
    this.stateCount = 0;
    this.deathLogged = true;
    this.world.logKill(this);
  }

  private tickDying(): void {
    this.world.map.decals.bloodSplat(this.position);
    if (this.animator.animate(DYING_ANIMATION_SPEED)) {
      this.playSound(SoundId.CreatureHitFloor);
      this.setState(CreatureState.Dead);
    }
  }

  protected enterDead(): void {
    const seconds = this.isPlayer ? PLAYER_CORPSE_SECONDS : CORPSE_SECONDS;
    this.stateCount = this.world.ticksPerSecond * seconds;
    this.flags |= ThingFlag.SortFloor;
    this.clearCollideCell();
    this.animator.setAnimation(CreatureAnimation.Dead, 0);
    this.world.map.decals.bloodSplat(this.position);
  }

  private tickDead(): void {
    const fadeTicks = this.world.ticksPerSecond * CORPSE_FADE_SECONDS;
    this.alpha = this.stateCount < fadeTicks && this.world.settings.detail ? (this.stateCount / fadeTicks) * OPAQUE_ALPHA : OPAQUE_ALPHA;
    if (--this.stateCount < 0) this.delete();
  }
}

export const MoveResult = {
  None: 'none',
  Moved: 'moved',
  CellMoved: 'cellMoved',
} as const;

export type MoveResult = (typeof MoveResult)[keyof typeof MoveResult];
