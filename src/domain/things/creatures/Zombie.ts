import { CharacterAnimator } from '../../animation/CharacterAnimator.ts';
import { Angle } from '../../math/Angle.ts';
import { CELL_CENTRE_OFFSET, type Position } from '../../math/Position.ts';
import { CollideFlag, CollideMask } from '../../map/CollideFlag.ts';
import { NO_DIRECTION } from '../../map/NavigationField.ts';
import { ZOMBIE_HIT_SOUNDS } from '../../sounds.ts';
import { CharacterStyle } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ZombieAttackAffect } from '../affects/ZombieAttackAffect.ts';
import type { PlayerThing } from '../PlayerThing.ts';
import type { StateHandlers } from '../StateMachine.ts';
import type { ThingOptions } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { CreatureAnimation, ZOMBIE_COLLECTION } from './characterCollections.ts';
import { Creature } from './Creature.ts';
import { CreatureState } from './CreatureState.ts';
import { ATTACK_SPEED_FACTOR, ATTACK_SPEED_REFERENCE_TICKS, MAX_ATTACK_ANIMATION_SPEED, ZOMBIE } from './tuning.ts';

export function attackAnimationSpeed(rate: number, speed: number): number {
  return Math.min(rate * (speed * ATTACK_SPEED_REFERENCE_TICKS * ATTACK_SPEED_FACTOR), MAX_ATTACK_ANIMATION_SPEED);
}

export function randomHitSound(world: WorldContext): (typeof ZOMBIE_HIT_SOUNDS)[number] | undefined {
  return ZOMBIE_HIT_SOUNDS[world.rng.int(ZOMBIE_HIT_SOUNDS.length)];
}

export function cellCentreAngle(from: Position, target: Position): Angle {
  return new Angle(Math.atan2(target.cellY + CELL_CENTRE_OFFSET - from.y, target.cellX + CELL_CENTRE_OFFSET - from.x));
}

export class Zombie extends Creature {
  readonly classId = ThingClass.Zombie;
  damage: number = ZOMBIE.damage;
  targetPlayer: PlayerThing | undefined = undefined;

  constructor(world: WorldContext, position: Position, options: ThingOptions = {}) {
    super(world, position, options, new CharacterAnimator(world.animations, ZOMBIE_COLLECTION, CharacterStyle.Zombie));
  }

  protected override processInit(): void {
    super.processInit();
    this.speed = ZOMBIE.speed;
    this.setState(CreatureState.EnterMap);
    this.score = ZOMBIE.score;
    this.height = ZOMBIE.height;
    this.damage = ZOMBIE.damage;
    const damageSound = randomHitSound(this.world);
    const deathSound = randomHitSound(this.world);
    if (damageSound) this.sounds.damage = damageSound;
    if (deathSound) this.sounds.death = deathSound;
    this.world.upgrades.registerCreature(this);
  }

  protected override ownStates(): Partial<StateHandlers<CreatureState>> {
    return {
      gotoPlayer: { enter: () => this.enterGotoPlayer(), tick: () => this.tickGotoPlayer() },
      attack: { enter: () => this.animator.setAnimation(CreatureAnimation.Attack), tick: () => this.tickAttack() },
    };
  }

  private enterGotoPlayer(): void {
    this.baseState = this.states.current;
    this.animator.setAnimation(CreatureAnimation.Walk);
  }

  private tickGotoPlayer(): void {
    this.targetPlayer = this.world.things.closestPlayer(this.position);
    const cell = this.cellHere();
    this.currentCell = cell;
    if (!this.targetPlayer || !cell) {
      this.setState(CreatureState.Wait);
      return;
    }
    const current = this.angle.direction;
    this.targetAngle.radians = cellCentreAngle(this.position, this.targetPlayer.position).radians;
    this.targetDirection = this.targetAngle.direction;
    if (cell.collideFlagsToward(this.targetDirection) & CollideFlag.Player) {
      this.setStateWithDirection(CreatureState.Attack, current, this.targetDirection);
      return;
    }
    this.targetDirection = this.world.map.navigation.direction(cell, current, this.targetDirection, CollideMask.NonMovable, false);
    if (this.targetDirection === NO_DIRECTION) {
      this.setState(CreatureState.Wait);
      return;
    }
    this.setStateWithDirectionWait(CreatureState.CellToCell, current, this.targetDirection);
  }

  private tickAttack(): void {
    if (!this.animator.animate(attackAnimationSpeed(ZOMBIE.attackAnimationRate, this.speed))) return;
    const attack = new ZombieAttackAffect(this, this.damage);
    for (const cell of this.cellHere()?.cellsToward(this.angle.direction, CollideFlag.Player) ?? []) cell.affect(attack);
    const returnState = this.states.previous;
    this.setState(CreatureState.Sleep);
    this.stateCount = ZOMBIE.attackSleepTicks;
    this.states.previous = returnState;
  }
}
