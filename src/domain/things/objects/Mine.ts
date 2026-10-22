import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import type { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CollideFlag } from '../../map/CollideFlag.ts';
import type { MapCell } from '../../map/MapCell.ts';
import { SoundId } from '../../sounds.ts';
import type { UpgradableObject } from '../../upgrades/contracts.ts';
import type { Visual } from '../../visuals.ts';
import { GameMode } from '../../world/GameMode.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { MINE } from './tuning.ts';

export const ExplosivePhase = {
  Init: 'init',
  Arming: 'arming',
  Armed: 'armed',
  Detonating: 'detonating',
} as const;

export type ExplosivePhase = (typeof ExplosivePhase)[keyof typeof ExplosivePhase];

export abstract class PlacedExplosive extends Thing implements UpgradableObject {
  biggerBang = 0;
  clusterExplode = 0;
  upgradeStamp: number | undefined = undefined;
  detonateCounter = 0;
  currentCell: MapCell | undefined = undefined;
  phase: ExplosivePhase = ExplosivePhase.Init;
  protected readonly animator: ClipAnimator;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    parent: Thing | undefined,
    readonly damage: number,
    private readonly symbol: typeof ClipSymbol.Mine | typeof ClipSymbol.ChargePack,
    private readonly detonateAnimationSpeed: number,
  ) {
    super(world, position.cellCentre(), parent ? { angle, parent } : { angle });
    this.flags |= ThingFlag.SortFloor;
    this.animator = clipAnimator(world.animations, symbol);
  }

  override visual(): Visual {
    return animationClip(this.symbol, this.animator, this.position);
  }

  protected place(): void {
    this.world.map.mapwho.moveThing(this);
    this.currentCell = this.world.map.cellAt(this.position.x, this.position.y);
    this.world.upgrades.registerObject(this);
  }

  protected startDetonation(counter: number): void {
    this.detonateCounter = counter;
    this.playSound(SoundId.MineDetonate);
    this.phase = ExplosivePhase.Detonating;
    this.detonate();
  }

  protected detonate(): void {
    this.animator.cycle(this.detonateAnimationSpeed);
    if (--this.detonateCounter >= 0) return;
    this.world.upgrades.applyObjectUpgrade(this);
    const explosion = this.world.things.add(new Explosion(this.world, this.position, this.angle, this.parent, this.damage));
    explosion.clusterExplode = this.clusterExplode;
    explosion.biggerBang = this.biggerBang;
    this.delete();
  }
}

export class Mine extends PlacedExplosive {
  readonly classId = ThingClass.Mine;
  private triggerFlags = 0;

  constructor(world: WorldContext, position: Position, angle: Angle, parent?: Thing, damage: number = MINE.defaultDamage) {
    super(world, position, angle, parent, damage, ClipSymbol.Mine, MINE.detonateAnimationSpeed);
  }

  process(): void {
    switch (this.phase) {
      case ExplosivePhase.Init: {
        this.place();
        const deathMatch = this.world.settings.gameMode === GameMode.DeathMatch;
        this.triggerFlags = CollideFlag.Creature | (deathMatch ? CollideFlag.Player : CollideFlag.None);
        this.phase = deathMatch ? ExplosivePhase.Arming : ExplosivePhase.Armed;
        if (deathMatch) this.arm();
        else this.watch();
        return;
      }
      case ExplosivePhase.Arming:
        this.arm();
        return;
      case ExplosivePhase.Armed:
        this.watch();
        return;
      case ExplosivePhase.Detonating:
        this.detonate();
        return;
    }
  }

  private triggered(): boolean {
    return ((this.currentCell?.collide ?? CollideFlag.None) & this.triggerFlags) !== 0;
  }

  private arm(): void {
    if (!this.triggered()) this.phase = ExplosivePhase.Armed;
  }

  private watch(): void {
    this.animator.cycle(MINE.idleFramesPerSecond / this.world.ticksPerSecond);
    if (this.triggered()) this.startDetonation(this.world.ticksPerSecond * MINE.detonateSeconds);
  }
}
