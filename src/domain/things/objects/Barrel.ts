import { Angle } from '../../math/Angle.ts';
import type { Position } from '../../math/Position.ts';
import { CollideFlag } from '../../map/CollideFlag.ts';
import type { MapCell } from '../../map/MapCell.ts';
import type { UpgradableObject } from '../../upgrades/contracts.ts';
import type { Visual } from '../../visuals.ts';
import type { WorldContext } from '../../world/WorldContext.ts';
import { AffectType } from '../affects/AffectType.ts';
import { affectorsInProcessingOrder } from '../affects/hitReaction.ts';
import { ClipSymbol, staticClip } from '../clipVisual.ts';
import { Explosion } from '../effects/Explosion.ts';
import { Thing } from '../Thing.ts';
import { ThingClass } from '../ThingClass.ts';
import { ThingFlag } from '../ThingFlag.ts';
import { PlacementPhase } from './PlacementPhase.ts';
import { BARREL } from './tuning.ts';

const BARREL_AFFECTS = AffectType.Bullet | AffectType.Explosion | AffectType.DevilAttack | AffectType.FireBall;

export class Barrel extends Thing implements UpgradableObject {
  readonly classId = ThingClass.Barrel;
  biggerBang = 0;
  clusterExplode = 0;
  upgradeStamp: number | undefined = undefined;
  life = 0;
  maxLife = 0;
  currentCell: MapCell | undefined = undefined;
  phase: PlacementPhase = PlacementPhase.Init;

  constructor(
    world: WorldContext,
    position: Position,
    angle: Angle = new Angle(0),
    parent?: Thing,
    readonly damage: number = BARREL.defaultDamage,
  ) {
    super(world, position.cellCentre(), parent ? { angle, parent } : { angle });
    this.makeIdUnique();
  }

  process(): void {
    if (this.phase === PlacementPhase.Init) this.init();
    if (this.phase === PlacementPhase.PlayerOnCell) {
      if (this.playerOnCell()) return;
      this.flags |= ThingFlag.Collidable;
      this.phase = PlacementPhase.GrowRadius;
    }
    if (this.phase === PlacementPhase.GrowRadius) {
      if (this.growRadius(BARREL.radius)) return;
      this.phase = PlacementPhase.NormalInit;
    }
    if (this.phase === PlacementPhase.NormalInit) {
      this.setRadius(BARREL.radius);
      this.flags |= ThingFlag.Collidable;
      this.phase = PlacementPhase.Normal;
    }
    if (this.phase === PlacementPhase.Normal && this.affectors.length > 0) this.processAffects();
  }

  override visual(): Visual {
    return staticClip(ClipSymbol.Barrel, this.position);
  }

  override dispose(): void {
    super.dispose();
    if (this.currentCell) this.currentCell.collide &= ~CollideFlag.Object;
  }

  private init(): void {
    this.affectSetup(BARREL_AFFECTS);
    this.clusterExplode = this.biggerBang = 0;
    this.maxLife = this.life = BARREL.life;
    this.height = BARREL.height;
    this.world.map.mapwho.moveThing(this);
    this.currentCell = this.world.map.cellAt(this.position.x, this.position.y);
    if (this.currentCell) this.currentCell.collide |= CollideFlag.Object;
    this.world.upgrades.registerObject(this);
    this.phase = this.playerOnCell() ? PlacementPhase.PlayerOnCell : PlacementPhase.NormalInit;
  }

  private playerOnCell(): boolean {
    return ((this.currentCell?.collide ?? CollideFlag.None) & CollideFlag.Player) !== 0;
  }

  private processAffects(): void {
    const affects = this.affectors;
    this.affectors = [];
    for (const affect of affectorsInProcessingOrder(affects)) {
      if (!(affect.type & BARREL_AFFECTS)) continue;
      this.world.upgrades.applyObjectUpgrade(this);
      this.delete();
      const explosion = this.world.things.add(new Explosion(this.world, this.position, this.angle, this.parent, this.damage));
      explosion.clusterExplode = this.clusterExplode;
      explosion.biggerBang = this.biggerBang;
      return;
    }
  }
}
