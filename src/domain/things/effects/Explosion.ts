import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import { Angle } from '../../math/Angle.ts';
import { FULL_TURN, type Position } from '../../math/Position.ts';
import { CellRect } from '../../map/CellRect.ts';
import { SoundId } from '../../sounds.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { ExplosionAffect } from '../affects/ExplosionAffect.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { ClusterShell } from '../shots/ClusterShell.ts';
import type { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { Effect } from './Effect.ts';
import { EXPLOSION } from './tuning.ts';

export function explosionRange(damage: number): number {
  return EXPLOSION.baseRangeCells + Math.max(damage - EXPLOSION.rangeDamageThreshold, 0) * EXPLOSION.rangePerDamage;
}

const ExplosionPhase = {
  Init: 'init',
  Delay: 'delay',
  Burning: 'burning',
} as const;

type ExplosionPhase = (typeof ExplosionPhase)[keyof typeof ExplosionPhase];

export class Explosion extends Effect {
  readonly classId = ThingClass.EffectExplosion;
  readonly range: number;
  delay = 0;
  clusterExplode = 0;
  biggerBang = 0;
  private phase: ExplosionPhase = ExplosionPhase.Init;
  private animator: ClipAnimator | undefined = undefined;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle,
    parent: Thing | undefined,
    readonly damage: number,
  ) {
    super(world, position, angle, parent);
    this.makeIdUnique();
    this.range = explosionRange(damage);
  }

  get detonated(): boolean {
    return this.phase === ExplosionPhase.Burning;
  }

  process(): void {
    switch (this.phase) {
      case ExplosionPhase.Init:
        this.spawnFragments();
        this.phase = ExplosionPhase.Delay;
        this.processDelay();
        return;
      case ExplosionPhase.Delay:
        this.processDelay();
        return;
      case ExplosionPhase.Burning:
        this.burn();
        return;
    }
  }

  override visual(): Visual | undefined {
    return this.animator ? animationClip(ClipSymbol.Explosion, this.animator, this.position) : undefined;
  }

  private spawnFragments(): void {
    const { rng, things } = this.world;
    if (this.clusterExplode) {
      const step = FULL_TURN / EXPLOSION.clusterShells;
      for (let a = 0; a < FULL_TURN; a += step) {
        const angle = new Angle(a + rng.next() * (step / EXPLOSION.clusterJitterDivisor) - step / (EXPLOSION.clusterJitterDivisor * 2));
        things.add(new ClusterShell(this.world, this.position.clone(), angle, this.parent, this.damage));
      }
    }
    if (this.biggerBang) {
      const step = FULL_TURN / (this.biggerBang * EXPLOSION.bangSpreadFactor);
      for (let a = 0; a < FULL_TURN; a += step) {
        const angle = new Angle(a + rng.next() * (step / EXPLOSION.bangJitterDivisor) - step / (EXPLOSION.bangJitterDivisor * 2));
        const fragment = things.add(new Explosion(this.world, this.position.add(angle.delta), angle, this.parent, this.damage));
        fragment.delay = EXPLOSION.bangMinDelayTicks + rng.int(EXPLOSION.bangDelayChoices);
      }
    }
  }

  private processDelay(): void {
    if (--this.delay >= 0) return;
    this.world.shake(this.position, EXPLOSION.shakeX, EXPLOSION.shakeY);
    this.world.flashBrightness(this.position, EXPLOSION.brightness);
    const area = CellRect.around(this.position.x, this.position.y, this.range);
    this.world.map.affects.affectArea(area, new ExplosionAffect(this.parent, this, this.damage, this.range));
    this.world.map.decals.scorchMark(this.position);
    this.playSound(SoundId.EffectExplosion);
    this.animator = clipAnimator(this.world.animations, ClipSymbol.Explosion);
    this.world.map.mapwho.moveThing(this);
    this.phase = ExplosionPhase.Burning;
    this.burn();
  }

  private burn(): void {
    if (this.animator?.animate(EXPLOSION.animationSpeed)) this.delete();
  }
}
