import { ModelPoint } from '../../animation/AnimationCatalog.ts';
import { CharacterAnimator } from '../../animation/CharacterAnimator.ts';
import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CollideFlag, CollideMask } from '../../map/CollideFlag.ts';
import { LineHitKind } from '../../map/MapCell.ts';
import { NO_DIRECTION } from '../../map/NavigationField.ts';
import { CharacterStyle } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { DevilAttackAffect } from '../affects/DevilAttackAffect.ts';
import type { PlayerThing } from '../PlayerThing.ts';
import { FireBall } from '../shots/FireBall.ts';
import { FIREBALL } from '../shots/tuning.ts';
import type { StateHandlers } from '../StateMachine.ts';
import type { ThingOptions } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { CreatureAnimation, DEVIL_COLLECTION } from './characterCollections.ts';
import { Creature } from './Creature.ts';
import { CreatureState } from './CreatureState.ts';
import { DEVIL, HAND_MIDPOINT } from './tuning.ts';
import { attackAnimationSpeed, cellCentreAngle, randomHitSound } from './Zombie.ts';

export class Devil extends Creature {
  readonly classId = ThingClass.Devil;
  attackRange: number = DEVIL.attackRange;
  attackDamage: number = DEVIL.attackDamage;
  attackSpeed: number | undefined = undefined;
  fireRate: number = DEVIL.fireRate;
  fireRateCount = 0;
  targetPlayer: PlayerThing | undefined = undefined;
  private attackAngle: Angle | undefined = undefined;
  private attacksObject = false;
  private canAttack = false;

  constructor(world: WorldContext, position: Position, options: ThingOptions = {}) {
    super(world, position, options, new CharacterAnimator(world.animations, DEVIL_COLLECTION, CharacterStyle.Devil));
  }

  override affectSetup(flags: number): void {
    super.affectSetup(flags | AffectType.PlayerLineOfSight);
  }

  protected override processInit(): void {
    super.processInit();
    this.speed = DEVIL.speed;
    this.setRadius(DEVIL.radius);
    this.maxLife = this.life = DEVIL.life;
    this.attackRange = DEVIL.attackRange;
    this.attackDamage = DEVIL.attackDamage;
    this.mass = DEVIL.mass;
    this.fireRate = DEVIL.fireRate;
    this.score = DEVIL.score;
    this.height = DEVIL.height;
    this.fireRateCount = DEVIL.initialFireRateCount;
    this.world.upgrades.registerCreature(this);
    this.setState(CreatureState.EnterMap);
    const damageSound = randomHitSound(this.world);
    const deathSound = randomHitSound(this.world);
    if (damageSound) this.sounds.damage = damageSound;
    if (deathSound) this.sounds.death = deathSound;
  }

  protected override processNormal(): void {
    super.processNormal();
    this.fireRateCount--;
  }

  protected override stateAfterEnterMap(): CreatureState {
    return CreatureState.RemoveObject;
  }

  protected override ownStates(): Partial<StateHandlers<CreatureState>> {
    return {
      gotoPlayer: { enter: () => this.enterGotoPlayer(), tick: () => this.tickGotoPlayer() },
      attack: { enter: () => this.animator.setAnimation(CreatureAnimation.Attack), tick: () => this.tickAttack() },
      removeObject: { enter: () => this.enterRemoveObject(), tick: () => this.tickRemoveObject() },
    };
  }

  private brain(): boolean {
    this.targetPlayer = this.world.things.closestPlayer(this.position);
    if (this.targetPlayer && this.attackDecision(this.targetPlayer)) {
      this.attacksObject = false;
      this.attackAngle = new Angle(this.position.angleTo(this.targetPlayer.position));
      this.setState(CreatureState.Attack);
      return true;
    }
    this.canAttack = true;
    return false;
  }

  private attackDecision(target: PlayerThing): boolean {
    if (!this.canAttack || this.fireRateCount > 0) return false;
    if (target.life <= 0) return false;
    if (new Angle(this.position.angleTo(target.position)).direction !== this.angle.direction) return false;
    if (this.position.distanceSquared(target.position) > this.attackRange * this.attackRange) return false;
    const hit = this.world.map.collide.collideLine(this, this.position, target.position, FIREBALL.collideRadius, AffectType.PlayerLineOfSight);
    return hit?.kind === LineHitKind.Thing && hit.thing.classId === target.classId;
  }

  private enterGotoPlayer(): void {
    this.baseState = this.states.current;
    this.animator.setAnimation(CreatureAnimation.Walk);
  }

  private tickGotoPlayer(): void {
    if (this.brain()) return;
    const cell = this.cellHere();
    this.currentCell = cell;
    if (!this.targetPlayer || !cell) {
      this.setState(CreatureState.Wait);
      return;
    }
    const current = this.angle.direction;
    this.targetAngle.radians = cellCentreAngle(this.position, this.targetPlayer.position).radians;
    this.targetDirection = this.targetAngle.direction;
    if (cell.collideFlagsToward(this.targetDirection) & CollideFlag.Object) {
      this.attackAngle = this.angle.clone();
      this.attackAngle.direction = this.angle.direction;
      this.attacksObject = true;
      this.setStateWithDirection(CreatureState.Attack, current, this.targetDirection);
      return;
    }
    this.targetDirection = this.world.map.navigation.direction(cell, current, this.targetDirection, CollideMask.NonMovable, true);
    if (this.targetDirection === NO_DIRECTION) {
      this.setState(CreatureState.Wait);
      return;
    }
    this.setStateWithDirectionWait(CreatureState.CellToCell, current, this.targetDirection);
  }

  private tickAttack(): void {
    const step = this.animator.animateStep(attackAnimationSpeed(DEVIL.attackAnimationRate, this.speed));
    if (!step) return;
    if (step.newFrame && step.frameIndex === DEVIL.fireFrame) this.throwFireBall();
    if (step.animEnd) this.setState(this.states.previous ?? this.baseState);
  }

  private throwFireBall(): void {
    const angle = this.attackAngle ?? this.angle.clone();
    const position = this.handsPosition() ?? this.fallbackFireBallPosition(angle);
    this.world.things.add(new FireBall(this.world, position, angle.clone(), this, this.attackDamage, this.attacksObject, this.attackSpeed));
    this.fireRateCount = this.fireRate;
  }

  private handsPosition(): Position | undefined {
    const right = this.animator.modelPoint(ModelPoint.HandRight, this.angle);
    const left = this.animator.modelPoint(ModelPoint.HandLeft, this.angle);
    if (!right || !left) return undefined;
    return this.position.add(right.add(left).scale(HAND_MIDPOINT));
  }

  private fallbackFireBallPosition(angle: Angle): Position {
    const position = this.position.add(angle.delta.normalize(this.radius * DEVIL.fireballOffsetRadii));
    position.z = DEVIL.fireballHeight;
    return position;
  }

  private enterRemoveObject(): void {
    this.animator.setAnimation(CreatureAnimation.Stand);
    this.currentCell = this.cellHere();
  }

  private tickRemoveObject(): void {
    const ahead = this.currentCell?.adjacent(this.angle.direction);
    if (ahead && ahead.collide & CollideFlag.Object) {
      ahead.affect(new DevilAttackAffect(this, this, DEVIL.removeObjectDamage, this.angle));
      return;
    }
    this.setState(CreatureState.GotoPlayer);
  }
}
