import type { ClipAnimator } from '../../animation/ClipAnimator.ts';
import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CollideFlag } from '../../map/CollideFlag.ts';
import type { MapCell } from '../../map/MapCell.ts';
import type { UpgradableObject } from '../../upgrades/contracts.ts';
import { OPAQUE_ALPHA, type Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import type { Affect } from '../affects/Affect.ts';
import { AffectType } from '../affects/AffectType.ts';
import { affectorsInProcessingOrder } from '../affects/hitReaction.ts';
import { animationClip, clipAnimator, ClipSymbol } from '../clipVisual.ts';
import { SmokeCloud } from '../effects/SmokeCloud.ts';
import { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { PlacementPhase } from './PlacementPhase.ts';
import { WALL } from './tuning.ts';

const WALL_AFFECTS = AffectType.Bullet | AffectType.Explosion | AffectType.ZombieAttack | AffectType.DevilAttack | AffectType.FireBall;

export class Wall extends Thing implements UpgradableObject {
  readonly classId = ThingClass.Wall;
  biggerBang = 0;
  clusterExplode = 0;
  upgradeStamp: number | undefined = undefined;
  life: number = WALL.life;
  maxLife: number = WALL.life;
  alpha = OPAQUE_ALPHA;
  currentCell: MapCell | undefined = undefined;
  phase: PlacementPhase = PlacementPhase.Init;
  private readonly animator: ClipAnimator;

  constructor(world: WorldContext, position: Position, angle: Angle = new Angle(0), parent?: Thing) {
    super(world, position.cellCentre(), parent ? { angle, parent } : { angle });
    this.makeIdUnique();
    this.affectSetup(WALL_AFFECTS);
    this.animator = clipAnimator(world.animations, ClipSymbol.Wall);
  }

  get damageFrame(): number {
    return this.animator.frame;
  }

  override affect(affect: Affect): void {
    super.affect(affect);
    this.phase = PlacementPhase.Normal;
  }

  process(): void {
    if (this.phase === PlacementPhase.Init) this.init();
    if (this.phase === PlacementPhase.PlayerOnCell) {
      if (this.playerOnCell()) return;
      this.flags |= ThingFlag.Collidable;
      this.phase = PlacementPhase.GrowRadius;
    }
    if (this.phase === PlacementPhase.GrowRadius) {
      if (this.growRadius(WALL.grownRadius)) return;
      this.phase = PlacementPhase.Normal;
    }
    switch (this.phase) {
      case PlacementPhase.NormalInit:
        this.setRadius(WALL.radius);
        this.flags |= ThingFlag.Collidable;
        this.phase = PlacementPhase.Sleep;
        return;
      case PlacementPhase.Normal:
        if (this.affectors.length > 0) this.processAffects();
        return;
      case PlacementPhase.FadeOut:
        this.fadeOut();
        return;
      default:
        return;
    }
  }

  override visual(): Visual {
    return animationClip(ClipSymbol.Wall, this.animator, this.position, this.alpha);
  }

  override dispose(): void {
    super.dispose();
    if (this.currentCell) this.currentCell.collide &= ~CollideFlag.Object;
  }

  private init(): void {
    this.world.map.mapwho.moveThing(this);
    this.currentCell = this.world.map.cellAt(this.position.x, this.position.y);
    if (this.currentCell) this.currentCell.collide |= CollideFlag.Object;
    this.height = WALL.height;
    this.world.upgrades.registerObject(this);
    this.phase = this.playerOnCell() ? PlacementPhase.PlayerOnCell : PlacementPhase.NormalInit;
  }

  private playerOnCell(): boolean {
    return ((this.currentCell?.collide ?? CollideFlag.None) & CollideFlag.Player) !== 0;
  }

  private processAffects(): void {
    for (const affect of affectorsInProcessingOrder(this.affectors)) {
      if (!(affect.type & WALL_AFFECTS)) continue;
      affect.affectThing(this);
      if (this.life <= 0) {
        this.clearAffects();
        this.flags |= ThingFlag.Collidable;
        this.phase = PlacementPhase.FadeOut;
        this.fadeOut();
        this.world.things.add(new SmokeCloud(this.world, this.position.clone()));
        this.world.map.decals.scorchMark(this.position);
        return;
      }
      this.animator.goTo(Math.floor((1 - this.life / this.maxLife) * this.animator.frameCount));
    }
    this.affectors = [];
    this.phase = PlacementPhase.Sleep;
  }

  private fadeOut(): void {
    this.alpha -= WALL.fadeStep;
    if (this.alpha < WALL.fadeOutBelow) this.delete();
  }
}
